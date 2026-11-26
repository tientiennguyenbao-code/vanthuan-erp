import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AuthContext } from '../auth/auth.types';
import { ContractsService } from '../contracts/contracts.service';
import { DB, Db, DbExecutor } from '../db/db';
import { complaints, ExportLot, exportLots, feeRequests, financings, lotAllocations, lotEvents, lotPayments, partners, priceFixations, purchaseLots, settlements } from '../db/schema';
import { weightedFixedPrice } from '../sales/sales.rules';
import { LotState, SettlementInput, toUsd } from './settlement.rules';

export const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

/** Phần dùng chung của thanh toán, khiếu nại và quyết toán: quyền xem lô, khoá lô khi đang quyết toán, số liệu tiền của lô. */
@Injectable()
export class LotFinanceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly contracts: ContractsService,
  ) {}

  canSeeAll(ctx: AuthContext) {
    return ctx.permissions.includes('PHI_XEM_TAT_CA');
  }

  /** Xem tiền của lô: ai xem được mọi khoản phí, hoặc nhân viên phụ trách lô. */
  assertCanView(lot: { ownerUserId: string }, ctx: AuthContext) {
    if (this.canSeeAll(ctx)) return;
    if (ctx.permissions.includes('PHI_XEM_CUA_MINH') && lot.ownerUserId === ctx.user.id) return;
    throw new ForbiddenException('Bạn không xem được thanh toán của lô này');
  }

  assertCan(ctx: AuthContext, p: AuthContext['permissions'][number], message: string) {
    if (!ctx.permissions.includes(p)) throw new ForbiddenException(message);
  }

  async findLot(id: string, exec: DbExecutor = this.db): Promise<ExportLot> {
    const [l] = await exec.select().from(exportLots).where(eq(exportLots.id, id));
    if (!l) throw new NotFoundException('Không tìm thấy lô xuất');
    return l;
  }

  async lockLot(id: string, tx: DbExecutor): Promise<ExportLot> {
    const [l] = await tx.select().from(exportLots).where(eq(exportLots.id, id)).for('update');
    if (!l) throw new NotFoundException('Không tìm thấy lô xuất');
    return l;
  }

  /** Bản quyết toán đang hiệu lực (chờ duyệt hoặc đã duyệt) của lô, nếu có. */
  async activeSettlement(lotId: string, exec: DbExecutor = this.db) {
    const [s] = await exec
      .select()
      .from(settlements)
      .where(and(eq(settlements.exportLotId, lotId), sql`${settlements.status} <> 'tra_lai'`))
      .orderBy(desc(settlements.preparedAt))
      .limit(1);
    return s ?? null;
  }

  /** Khi lô đang chờ duyệt hoặc đã quyết toán, số liệu tiền của lô bị khoá để khớp với bản quyết toán. */
  async assertUnlocked(lot: ExportLot, tx: DbExecutor) {
    if (lot.status === 'da_huy') throw new BadRequestException('Lô đã huỷ');
    const s = await this.activeSettlement(lot.id, tx);
    if (s) throw new BadRequestException(s.status === 'da_duyet' ? 'Lô đã quyết toán, số liệu đã khoá' : 'Lô đang chờ duyệt quyết toán; trả lại bản quyết toán trước khi sửa số liệu');
  }

  async lotState(lot: ExportLot, exec: DbExecutor = this.db): Promise<LotState & { inspection: 'dat' | 'khong_dat' | null }> {
    const [insp] = await exec
      .select({ result: lotEvents.result })
      .from(lotEvents)
      .where(and(eq(lotEvents.exportLotId, lot.id), eq(lotEvents.kind, 'giam_dinh')))
      .orderBy(desc(lotEvents.id))
      .limit(1);
    const [fin] = await exec
      .select({ n: sql<number>`count(*)::int` })
      .from(financings)
      .where(and(eq(financings.exportLotId, lot.id), inArray(financings.status, ['da_giai_ngan', 'da_tat_toan'])));
    const inspection = (insp?.result as 'dat' | 'khong_dat' | undefined) ?? null;
    return {
      inspection,
      inspectionPassed: inspection === 'dat',
      shipped: !!lot.shippedOn,
      documentsComplete: lot.status === 'hoan_tat',
      financingDisbursed: fin.n > 0,
      today: today(),
    };
  }

  /** Các lô mua trong lô xuất với khối lượng phân bổ, giá trị theo giá bán và (mua đứt) giá vốn theo hợp đồng mua, quy USD. */
  async lotValues(lot: ExportLot, exec: DbExecutor = this.db) {
    const counter = await this.contracts.signedTerms(lot.counterContractId, exec);
    if (!counter) throw new BadRequestException('Hợp đồng đối ứng không còn hiệu lực');
    let salePerKg = counter.terms.donGia / (counter.terms.donVi === 'tan' ? 1000 : 1);
    if (counter.terms.giaTruLui) {
      // Giá trừ lùi: dùng giá bình quân đã chốt (USD/tấn); chưa chốt thì tạm theo đơn giá dự kiến trong hợp đồng.
      const fixes = await exec
        .select({ quantityKg: priceFixations.quantityKg, finalPrice: priceFixations.finalPrice })
        .from(priceFixations)
        .where(and(eq(priceFixations.exportLotId, lot.id), isNull(priceFixations.voidedAt)));
      const avg = weightedFixedPrice(fixes);
      if (avg !== null) salePerKg = avg / 1000;
    }
    const saleFx = counter.terms.tienTe === 'USD' ? 1 : (counter.terms.tyGiaUsd ?? null);
    const allocs = await exec
      .select({
        purchaseLotId: lotAllocations.purchaseLotId,
        quantityKg: sql<number>`sum(${lotAllocations.quantityKg})::float8`,
        code: purchaseLots.code,
        supplierId: purchaseLots.supplierPartnerId,
        supplierName: partners.name,
        contractId: purchaseLots.contractId,
      })
      .from(lotAllocations)
      .innerJoin(purchaseLots, eq(purchaseLots.id, lotAllocations.purchaseLotId))
      .innerJoin(partners, eq(partners.id, purchaseLots.supplierPartnerId))
      .where(and(eq(lotAllocations.exportLotId, lot.id), isNull(lotAllocations.cancelledAt)))
      .groupBy(lotAllocations.purchaseLotId, purchaseLots.code, purchaseLots.supplierPartnerId, partners.name, purchaseLots.contractId)
      .orderBy(purchaseLots.code);
    const rows = [];
    for (const a of allocs) {
      let costUsd: number | null = null;
      if (lot.dealType === 'mua_dut') {
        const buy = await this.contracts.signedTerms(a.contractId, exec);
        if (buy) costUsd = toUsd((a.quantityKg * buy.terms.donGia) / (buy.terms.donVi === 'tan' ? 1000 : 1), buy.terms.tienTe, buy.terms.tyGiaUsd);
      }
      rows.push({ ...a, valueUsd: toUsd(a.quantityKg * salePerKg, counter.terms.tienTe, saleFx), costUsd });
    }
    const goods = rows.reduce((s, r) => s + (r.valueUsd ?? 0), 0);
    return { counter, currency: counter.terms.tienTe, fxPerUsd: saleFx, purchaseLots: rows, goodsValueUsd: goods, missingFx: rows.some((r) => r.valueUsd === null) };
  }

  /** Gom số liệu của lô để tính quyết toán. */
  async settlementInput(lot: ExportLot, exec: DbExecutor = this.db): Promise<SettlementInput> {
    const v = await this.lotValues(lot, exec);
    const pays = await exec.select().from(lotPayments).where(eq(lotPayments.exportLotId, lot.id));
    const fees = await exec.select().from(feeRequests).where(eq(feeRequests.exportLotId, lot.id));
    const fins = await exec.select().from(financings).where(eq(financings.exportLotId, lot.id));
    const comps = await exec.select().from(complaints).where(eq(complaints.exportLotId, lot.id));
    const cUsd = (amount: number | null, currency: string) => (amount ? (toUsd(amount, currency, currency === v.currency ? v.fxPerUsd : null) ?? 0) : 0);
    return {
      dealType: lot.dealType as 'mua_dut' | 'moi_gioi',
      lotStatus: lot.status,
      goodsValueUsd: v.goodsValueUsd,
      purchaseLots: v.purchaseLots.map((p) => ({ purchaseLotId: p.purchaseLotId, code: p.code, supplierName: p.supplierName, costUsd: p.costUsd })),
      payments: pays
        .filter((p) => p.status === 'da_thuc_hien')
        .map((p) => ({ kind: p.kind, category: p.category, purchaseLotId: p.purchaseLotId, financingId: p.financingId, amountUsd: toUsd(p.paidAmount!, p.currency, p.fxPerUsd) ?? 0 })),
      pendingPayments: pays.filter((p) => p.status === 'du_kien').length,
      fees: fees.map((f) => ({
        status: f.status,
        amountUsd: f.amount === null ? null : toUsd(f.amount, f.currency, f.fxPerUsd),
        baseUsd: toUsd(f.baseValue, f.currency, f.fxPerUsd) ?? 0,
      })),
      financings: fins.map((f) => {
        const amountUsd = toUsd(f.amount, f.currency, f.fxPerUsd) ?? 0;
        return { id: f.id, status: f.status, amountUsd, feeUsd: (amountUsd * f.feeRatePct) / 100 };
      }),
      complaints: comps.map((c) => ({
        status: c.status,
        agreedUsd: cUsd(c.agreedAmount, c.currency),
        passBackPurchaseLotId: c.passBackPurchaseLotId,
        passBackUsd: cUsd(c.passBackAmount, c.currency),
      })),
    };
  }
}
