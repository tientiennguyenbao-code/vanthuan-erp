import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { sha256Hex } from '../common/crypto';
import { stableStringify } from '../common/stable-json';
import { ContractsService } from '../contracts/contracts.service';
import { DB, Db, DbExecutor } from '../db/db';
import { ExportLot, exportLots, lotAllocations, priceFixations, samples, users } from '../db/schema';
import { fixingState, salesGateProblems } from './sales-gate';
import { deliveryProgress, fixationRefusal, fixedPrice, fixingWarning, weightedFixedPrice } from './sales.rules';

export interface FixationInput {
  fixedOn: string;
  quantityKg: number;
  futuresPrice: number;
  requestedBy: 'nguoi_mua' | 'van_thuan';
  note: string | null;
}

/** Chốt giá trừ lùi theo từng lô xuất (BH-2): ghi từng lần chốt, chặn xếp tàu khi chưa chốt đủ. */
@Injectable()
export class PriceFixingService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly contracts: ContractsService,
    private readonly audit: AuditService,
  ) {}

  private canView(lot: ExportLot, ctx: AuthContext) {
    const p = ctx.permissions;
    return p.includes('LO_HANG_XEM_TAT_CA') || p.includes('HOP_DONG_XEM_TAT_CA') || lot.ownerUserId === ctx.user.id;
  }
  private canRecord(lot: ExportLot, ctx: AuthContext) {
    const p = ctx.permissions;
    if (p.includes('LO_HANG_PHAN_CONG') || p.includes('HOP_DONG_SOAN_TAT_CA')) return true;
    return lot.ownerUserId === ctx.user.id && (p.includes('LO_HANG_QUAN_LY_CUA_MINH') || p.includes('HOP_DONG_SOAN_CUA_MINH'));
  }

  private async lot(id: string, exec: DbExecutor, lock = false) {
    const q = exec.select().from(exportLots).where(eq(exportLots.id, id));
    const [lot] = lock ? await q.for('update') : await q;
    if (!lot) throw new NotFoundException('Không tìm thấy lô xuất');
    return lot;
  }

  /** Tình hình chốt giá và điều kiện bán hàng của lô, cho trang lô xuất. */
  async state(lotId: string, ctx: AuthContext) {
    const lot = await this.lot(lotId, this.db);
    if (!this.canView(lot, ctx)) throw new ForbiddenException('Bạn không xem được lô này');
    const s = await this.contracts.signedTerms(lot.counterContractId, this.db);
    const terms = s?.terms ?? null;
    const diff = terms?.giaTruLui ?? null;
    const rows = await this.db
      .select({ f: priceFixations, createdByName: users.fullName })
      .from(priceFixations)
      .innerJoin(users, eq(users.id, priceFixations.createdBy))
      .where(eq(priceFixations.exportLotId, lotId))
      .orderBy(asc(priceFixations.fixedOn), asc(priceFixations.createdAt));
    const f = terms && diff ? await fixingState(lot, terms, this.db) : null;
    const active = rows.filter((r) => !r.f.voidedAt).map((r) => r.f);
    const pre = terms?.duyetMauTruocXuat
      ? await this.db.select({ code: samples.code, status: samples.status }).from(samples).where(and(eq(samples.exportLotId, lotId), eq(samples.kind, 'truoc_xuat')))
      : [];
    const open = !['xep_tau', 'hoan_tat', 'da_huy'].includes(lot.status);
    const tol = terms?.dungSaiPhanTram ?? 0;
    return {
      dotGiao: terms?.dotGiao?.length ? { dot: lot.shipmentNo, tongSoDot: terms.dotGiao.length } : null,
      canMauTruocXuat: !!terms?.duyetMauTruocXuat,
      mauTruocXuat: pre,
      giaTruLui: diff
        ? {
            san: diff.san,
            kyHan: diff.kyHan,
            chenhLech: diff.chenhLech,
            canChotKg: f!.needFixKg,
            daChotKg: f!.fixedKg,
            toiDaKg: Math.round(f!.plannedKg * (1 + tol / 100) * 1000) / 1000,
            conLaiKg: Math.max(0, Math.round((f!.needFixKg - f!.fixedKg) * 1000) / 1000),
            giaBinhQuan: weightedFixedPrice(active),
            canhBao: fixingWarning(lot.etd, f!.needFixKg - f!.fixedKg),
            lanChot: rows.map((r) => ({ ...r.f, createdByName: r.createdByName })),
          }
        : null,
      thieuBanHang: await salesGateProblems(lot, terms, this.db),
      quyen: { chotGia: !!diff && open && this.canRecord(lot, ctx) },
    };
  }

  async record(lotId: string, input: FixationInput, ctx: AuthContext) {
    return this.db.transaction(async (tx) => {
      const lot = await this.lot(lotId, tx, true);
      if (!this.canRecord(lot, ctx)) throw new ForbiddenException('Bạn không có quyền chốt giá cho lô này');
      const s = await this.contracts.signedTerms(lot.counterContractId, tx);
      if (!s) throw new BadRequestException('Hợp đồng đối ứng không còn hiệu lực');
      const diff = s.terms.giaTruLui ?? null;
      const st = diff ? await fixingState(lot, s.terms, tx) : { fixedKg: 0, plannedKg: 0 };
      const maxKg = st.plannedKg * (1 + (s.terms.dungSaiPhanTram ?? 0) / 100);
      const refusal = fixationRefusal({ hasDifferential: !!diff, lotStatus: lot.status, quantityKg: input.quantityKg, fixedKg: st.fixedKg, maxKg });
      if (refusal) throw new BadRequestException(refusal);
      const finalPrice = fixedPrice(diff!.san, input.futuresPrice, diff!.chenhLech);
      if (finalPrice <= 0) throw new BadRequestException('Giá chốt phải lớn hơn 0');
      const [row] = await tx
        .insert(priceFixations)
        .values({
          exportLotId: lot.id,
          contractId: lot.counterContractId,
          fixedOn: input.fixedOn,
          quantityKg: input.quantityKg,
          futuresPrice: input.futuresPrice,
          differential: diff!.chenhLech,
          finalPrice,
          requestedBy: input.requestedBy,
          note: input.note,
          createdBy: ctx.user.id,
        })
        .returning();
      const content = { loXuat: lot.code, ngay: input.fixedOn, kg: input.quantityKg, san: diff!.san, kyHan: diff!.kyHan, giaSan: input.futuresPrice, chenhLech: diff!.chenhLech, giaChot: finalPrice };
      const note = `${lot.code}: chốt ${input.quantityKg.toLocaleString('vi-VN')} kg giá ${finalPrice.toLocaleString('vi-VN')} USD/tấn`;
      await this.contracts.appendLedgerEvent(lot.counterContractId, 'chot_gia', sha256Hex(stableStringify(content)), note, ctx, tx);
      await this.audit.record({ actorUserId: ctx.user.id, action: 'lo_xuat.chot_gia', entityType: 'export_lot', entityId: lot.id, detail: content }, tx);
      return row;
    });
  }

  async void(lotId: string, fixationId: string, reason: string, ctx: AuthContext) {
    await this.db.transaction(async (tx) => {
      const lot = await this.lot(lotId, tx, true);
      if (!this.canRecord(lot, ctx)) throw new ForbiddenException('Bạn không có quyền huỷ chốt giá của lô này');
      if (['xep_tau', 'hoan_tat', 'da_huy'].includes(lot.status)) throw new BadRequestException('Lô đã xếp tàu, không huỷ chốt giá được');
      const [f] = await tx.select().from(priceFixations).where(and(eq(priceFixations.id, fixationId), eq(priceFixations.exportLotId, lotId)));
      if (!f) throw new NotFoundException('Không tìm thấy lần chốt giá');
      if (f.voidedAt) throw new BadRequestException('Lần chốt này đã huỷ');
      await tx.update(priceFixations).set({ voidedAt: new Date(), voidedBy: ctx.user.id, voidReason: reason }).where(eq(priceFixations.id, f.id));
      const content = { lanChot: f.id, lyDo: reason };
      await this.contracts.appendLedgerEvent(lot.counterContractId, 'huy_chot_gia', sha256Hex(stableStringify(content)), `${lot.code}: huỷ lần chốt ${f.fixedOn} (${reason})`, ctx, tx);
      await this.audit.record({ actorUserId: ctx.user.id, action: 'lo_xuat.huy_chot_gia', entityType: 'export_lot', entityId: lot.id, detail: content }, tx);
    });
  }

  /** Tiến độ giao theo đợt của một hợp đồng bán (ai xem được hợp đồng thì xem được). */
  async contractProgress(contractId: string, ctx: AuthContext) {
    await this.contracts.get(contractId, ctx);
    const s = await this.contracts.signedTerms(contractId, this.db);
    if (!s) return null;
    if (s.contract.kind !== 'ban' && s.contract.kind !== 'mua_ban_truc_tiep') return null;
    const t = s.terms;
    const toKg = (q: number) => (t.donVi === 'tan' ? q * 1000 : q);
    const plan = t.dotGiao?.length ? t.dotGiao.map((d) => ({ thang: d.thang, plannedKg: toKg(d.soLuong) })) : [{ thang: null, plannedKg: toKg(t.soLuong) }];
    const lots = await this.db
      .select({
        id: exportLots.id,
        code: exportLots.code,
        shipmentNo: exportLots.shipmentNo,
        status: exportLots.status,
        allocatedKg: sql<number>`coalesce((select sum(a.quantity_kg) from ${lotAllocations} a where a.export_lot_id = ${exportLots.id} and a.cancelled_at is null), 0)::float8`,
      })
      .from(exportLots)
      .where(eq(exportLots.counterContractId, contractId))
      .orderBy(asc(exportLots.shipmentNo));
    const withPrice = [];
    for (const l of lots) {
      const fx = await this.db
        .select({ quantityKg: priceFixations.quantityKg, finalPrice: priceFixations.finalPrice })
        .from(priceFixations)
        .where(and(eq(priceFixations.exportLotId, l.id), isNull(priceFixations.voidedAt)));
      withPrice.push({ ...l, fixedKg: fx.reduce((a, r) => a + r.quantityKg, 0), avgPrice: weightedFixedPrice(fx) });
    }
    return {
      ...deliveryProgress(plan, withPrice, t.dungSaiPhanTram ?? 0),
      nhieuDot: !!t.dotGiao?.length,
      giaTruLui: t.giaTruLui ?? null,
      canMauTruocXuat: !!t.duyetMauTruocXuat,
    };
  }

  /** Giá bình quân đã chốt của lô (USD/tấn), dùng cho tính giá trị lô. */
  async averagePrice(lotId: string, exec: DbExecutor = this.db): Promise<number | null> {
    const rows = await exec
      .select({ quantityKg: priceFixations.quantityKg, finalPrice: priceFixations.finalPrice })
      .from(priceFixations)
      .where(and(eq(priceFixations.exportLotId, lotId), isNull(priceFixations.voidedAt)));
    return weightedFixedPrice(rows);
  }
}
