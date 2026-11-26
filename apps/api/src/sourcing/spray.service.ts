import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { DB, Db, DbExecutor } from '../db/db';
import { farmers, growingAreas, plots, sprayLogs, users } from '../db/schema';
import { SourcingService } from './sourcing.service';

export interface SprayInput {
  plotId: string;
  sprayedOn: string;
  product: string;
  activeIngredient?: string | null;
  phiDays: number;
  dose?: string | null;
  note?: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Nhật ký dùng thuốc BVTV theo thửa gia vị: HTX ghi trên cổng, nhân viên thu mua ghi hoặc huỷ. */
@Injectable()
export class SprayService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly sourcing: SourcingService,
  ) {}

  private async scope(partnerId: string | null, ctx: AuthContext, write: boolean, exec: DbExecutor): Promise<{ partnerId: string; source: 'noi_bo' | 'cong_ncc' }> {
    const own = await this.sourcing.portalPartner(ctx, exec);
    if (own) {
      if (partnerId && partnerId !== own) throw new NotFoundException('Không tìm thấy thửa');
      return { partnerId: own, source: 'cong_ncc' };
    }
    if (!partnerId) throw new BadRequestException('Chọn nhà cung cấp');
    if (!ctx.permissions.includes(write ? 'NGUON_CUNG_QUAN_LY' : 'NGUON_CUNG_XEM')) throw new ForbiddenException('Bạn không có quyền với nhật ký thuốc');
    return { partnerId, source: 'noi_bo' };
  }

  async list(partnerIdArg: string | null, ctx: AuthContext) {
    const { partnerId, source } = await this.scope(partnerIdArg, ctx, false, this.db);
    const thua = await this.db
      .select({ id: plots.id, code: plots.code, crop: plots.crop, maHo: farmers.code })
      .from(plots)
      .innerJoin(growingAreas, eq(growingAreas.id, plots.growingAreaId))
      .innerJoin(farmers, eq(farmers.id, plots.farmerId))
      .where(and(eq(plots.supplierPartnerId, partnerId), isNull(plots.voidedAt), eq(growingAreas.sector, 'gia_vi')))
      .orderBy(asc(plots.code));
    const logs = thua.length
      ? await this.db
          .select({ l: sprayLogs, plotCode: plots.code, createdByName: users.fullName })
          .from(sprayLogs)
          .innerJoin(plots, eq(plots.id, sprayLogs.plotId))
          .innerJoin(users, eq(users.id, sprayLogs.createdBy))
          .where(inArray(sprayLogs.plotId, thua.map((t) => t.id)))
          .orderBy(desc(sprayLogs.sprayedOn), desc(sprayLogs.createdAt))
      : [];
    return {
      duocGhi: source === 'cong_ncc' || ctx.permissions.includes('NGUON_CUNG_QUAN_LY'),
      thua,
      nhatKy: logs.map((x) => ({
        id: x.l.id,
        thuaId: x.l.plotId,
        maThua: x.plotCode,
        ngayPhun: x.l.sprayedOn,
        thuoc: x.l.product,
        hoatChat: x.l.activeIngredient,
        cachLyNgay: x.l.phiDays,
        lieuLuong: x.l.dose,
        ghiChu: x.l.note,
        nguon: x.l.source,
        nguoiGhi: x.createdByName,
        huyLuc: x.l.voidedAt,
        lyDoHuy: x.l.voidReason,
        // HTX chỉ huỷ được dòng do chính cổng nhà cung cấp ghi; dòng nhân viên ghi thì nhân viên huỷ
        duocHuy: !x.l.voidedAt && (source === 'cong_ncc' ? x.l.source === 'cong_ncc' : ctx.permissions.includes('NGUON_CUNG_QUAN_LY')),
      })),
    };
  }

  async create(input: SprayInput, ctx: AuthContext, ip: string | null) {
    if (input.sprayedOn > today()) throw new BadRequestException('Ngày phun không được sau hôm nay');
    return this.db.transaction(async (tx) => {
      const [p] = await tx.select({ p: plots, sector: growingAreas.sector }).from(plots).innerJoin(growingAreas, eq(growingAreas.id, plots.growingAreaId)).where(eq(plots.id, input.plotId));
      if (!p) throw new NotFoundException('Không tìm thấy thửa');
      const { source } = await this.scope(p.p.supplierPartnerId, ctx, true, tx);
      if (p.p.voidedAt) throw new BadRequestException('Thửa đã bị huỷ');
      if (p.sector !== 'gia_vi') throw new BadRequestException('Nhật ký thuốc BVTV hiện dùng cho thửa gia vị');
      const [row] = await tx
        .insert(sprayLogs)
        .values({
          plotId: p.p.id,
          sprayedOn: input.sprayedOn,
          product: input.product,
          activeIngredient: input.activeIngredient ?? null,
          phiDays: input.phiDays,
          dose: input.dose ?? null,
          note: input.note ?? null,
          source,
          createdBy: ctx.user.id,
        })
        .returning({ id: sprayLogs.id });
      await this.audit.record(
        { actorUserId: ctx.user.id, action: 'nguon_cung.ghi_thuoc_bvtv', entityType: 'plot', entityId: p.p.id, ip, detail: { thua: p.p.code, ngayPhun: input.sprayedOn, thuoc: input.product, cachLyNgay: input.phiDays, nguon: source } },
        tx,
      );
      return { id: row.id };
    });
  }

  async void(id: string, reason: string, ctx: AuthContext, ip: string | null) {
    await this.db.transaction(async (tx) => {
      const [l] = await tx.select({ l: sprayLogs, p: plots }).from(sprayLogs).innerJoin(plots, eq(plots.id, sprayLogs.plotId)).where(eq(sprayLogs.id, id)).for('update');
      if (!l) throw new NotFoundException('Không tìm thấy dòng nhật ký');
      const { source } = await this.scope(l.p.supplierPartnerId, ctx, true, tx);
      if (source === 'cong_ncc' && l.l.source !== 'cong_ncc') throw new ForbiddenException('Dòng này do nhân viên Vạn Thuận ghi; liên hệ nhân viên thu mua để huỷ');
      if (l.l.voidedAt) throw new BadRequestException('Dòng này đã huỷ');
      await tx.update(sprayLogs).set({ voidedAt: new Date(), voidedBy: ctx.user.id, voidReason: reason }).where(eq(sprayLogs.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: 'nguon_cung.huy_thuoc_bvtv', entityType: 'plot', entityId: l.p.id, ip, detail: { thua: l.p.code, ngayPhun: l.l.sprayedOn, thuoc: l.l.product, lyDo: reason } }, tx);
    });
  }
}
