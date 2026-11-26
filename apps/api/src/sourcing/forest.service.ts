import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { sha256Hex } from '../common/crypto';
import { stableStringify } from '../common/stable-json';
import { DB, Db } from '../db/db';
import { farmers, growingAreas, partners, plotForestChecks, plots, users } from '../db/schema';
import { FOREST_METHODS, FOREST_RESULTS, forestReviewRefusal } from './collection.rules';

export const geometryHash = (g: unknown) => sha256Hex(stableStringify(g));

export interface ForestCheckInput {
  plotIds: string[];
  method: (typeof FOREST_METHODS)[number];
  result: (typeof FOREST_RESULTS)[number];
  evidence: string;
}

/**
 * Kiểm tra rừng theo thửa (mốc 31/12/2020): nhân viên thu mua ghi kết quả cho một hay nhiều thửa,
 * Trưởng phòng KD hoặc Ban Giám đốc duyệt. Chỉ kết quả đã duyệt mới đổi trạng thái của thửa.
 */
@Injectable()
export class ForestService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async list(filter: { status?: string; partnerId?: string }, ctx: AuthContext) {
    if (!ctx.permissions.includes('NGUON_CUNG_XEM')) throw new ForbiddenException('Bạn không xem được hồ sơ nguồn cung');
    const checker = alias(users, 'checker');
    const reviewer = alias(users, 'reviewer');
    const rows = await this.db
      .select({
        c: plotForestChecks,
        plotCode: plots.code,
        areaHa: plots.areaHa,
        geometryType: plots.geometryType,
        farmerCode: farmers.code,
        areaCode: growingAreas.code,
        supplierId: partners.id,
        supplierName: partners.name,
        checkerName: checker.fullName,
        reviewerName: reviewer.fullName,
      })
      .from(plotForestChecks)
      .innerJoin(plots, eq(plots.id, plotForestChecks.plotId))
      .innerJoin(farmers, eq(farmers.id, plots.farmerId))
      .innerJoin(growingAreas, eq(growingAreas.id, plots.growingAreaId))
      .innerJoin(partners, eq(partners.id, plots.supplierPartnerId))
      .innerJoin(checker, eq(checker.id, plotForestChecks.checkedBy))
      .leftJoin(reviewer, eq(reviewer.id, plotForestChecks.reviewedBy))
      .where(and(filter.status ? eq(plotForestChecks.status, filter.status) : undefined, filter.partnerId ? eq(plots.supplierPartnerId, filter.partnerId) : undefined))
      .orderBy(desc(plotForestChecks.checkedAt))
      .limit(500);
    return {
      duocDuyet: ctx.permissions.includes('NGUON_CUNG_DUYET_RUNG'),
      ketQua: rows.map((r) => ({
        id: r.c.id,
        plotId: r.c.plotId,
        plotCode: r.plotCode,
        areaHa: r.areaHa,
        geometryType: r.geometryType,
        farmerCode: r.farmerCode,
        areaCode: r.areaCode,
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        method: r.c.method,
        result: r.c.result,
        evidence: r.c.evidence,
        status: r.c.status,
        checkedBy: r.c.checkedBy,
        checkerName: r.checkerName,
        checkedAt: r.c.checkedAt,
        reviewerName: r.reviewerName,
        reviewedAt: r.c.reviewedAt,
        reviewNote: r.c.reviewNote,
        laCuaToi: r.c.checkedBy === ctx.user.id,
      })),
    };
  }

  async submit(input: ForestCheckInput, ctx: AuthContext, ip: string | null) {
    if (!ctx.permissions.includes('NGUON_CUNG_QUAN_LY')) throw new ForbiddenException('Bạn không ghi được kết quả kiểm tra rừng');
    const ids = [...new Set(input.plotIds)];
    return this.db.transaction(async (tx) => {
      const ps = await tx.select().from(plots).where(inArray(plots.id, ids)).for('update');
      if (ps.length !== ids.length) throw new NotFoundException('Có thửa không tồn tại');
      for (const p of ps) {
        if (p.voidedAt) throw new BadRequestException(`Thửa ${p.code} đã bị huỷ`);
        if (p.forestStatus === 'cho_duyet') throw new BadRequestException(`Thửa ${p.code} đang có kết quả chờ duyệt`);
      }
      const rows = await tx
        .insert(plotForestChecks)
        .values(ps.map((p) => ({ plotId: p.id, method: input.method, result: input.result, evidence: input.evidence, geometryHash: geometryHash(p.geometry), checkedBy: ctx.user.id })))
        .returning({ id: plotForestChecks.id, plotId: plotForestChecks.plotId });
      await tx.update(plots).set({ forestStatus: 'cho_duyet', updatedAt: new Date() }).where(inArray(plots.id, ids));
      await this.audit.record(
        { actorUserId: ctx.user.id, action: 'nguon_cung.kiem_tra_rung', entityType: 'plot', entityId: ids.length === 1 ? ids[0] : null, ip, detail: { thua: ps.map((p) => p.code), cach: input.method, ketQua: input.result, canCu: input.evidence } },
        tx,
      );
      return { soThua: rows.length, ids: rows.map((r) => r.id) };
    });
  }

  async review(input: { ids: string[]; dongY: boolean; ghiChu?: string | null }, ctx: AuthContext, ip: string | null) {
    if (!ctx.permissions.includes('NGUON_CUNG_DUYET_RUNG')) throw new ForbiddenException('Bạn không duyệt được kết quả kiểm tra rừng');
    if (!input.dongY && !input.ghiChu?.trim()) throw new BadRequestException('Ghi lý do trả lại');
    await this.db.transaction(async (tx) => {
      const ids = [...new Set(input.ids)];
      const checks = await tx.select().from(plotForestChecks).where(inArray(plotForestChecks.id, ids)).for('update');
      if (checks.length !== ids.length) throw new NotFoundException('Có kết quả không tồn tại');
      const ps = await tx.select().from(plots).where(inArray(plots.id, checks.map((c) => c.plotId))).for('update');
      const byId = new Map(ps.map((p) => [p.id, p]));
      const now = new Date();
      for (const c of checks) {
        const p = byId.get(c.plotId)!;
        const refusal = forestReviewRefusal(c, ctx.user.id, geometryHash(p.geometry));
        if (refusal) throw new BadRequestException(`Thửa ${p.code}: ${refusal}`);
        await tx
          .update(plotForestChecks)
          .set({ status: input.dongY ? 'da_duyet' : 'tu_choi', reviewedBy: ctx.user.id, reviewedAt: now, reviewNote: input.ghiChu?.trim() || null })
          .where(eq(plotForestChecks.id, c.id));
        await tx.update(plots).set({ forestStatus: input.dongY ? c.result : 'chua_kiem', updatedAt: now }).where(eq(plots.id, p.id));
      }
      await this.audit.record(
        {
          actorUserId: ctx.user.id, action: input.dongY ? 'nguon_cung.duyet_kiem_tra_rung' : 'nguon_cung.tra_lai_kiem_tra_rung', entityType: 'plot_forest_check',
          entityId: ids.length === 1 ? ids[0] : null, ip, detail: { thua: ps.map((p) => p.code), ghiChu: input.ghiChu ?? null },
        },
        tx,
      );
    });
  }
}
