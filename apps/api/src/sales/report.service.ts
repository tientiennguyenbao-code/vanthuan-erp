import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import type { AuthContext } from '../auth/auth.types';
import { contractValueUsd } from '../contracts/contract.rules';
import { ContractsService } from '../contracts/contracts.service';
import { DB, Db } from '../db/db';
import { commodities, contracts, contractVersions, exportLots, inquiries, lotAllocations, partners, priceFixations, quotes } from '../db/schema';
import { toUsd } from '../settlement/settlement.rules';
import { todayVn } from './credit-gate';
import { addMonths, buildReport, InquiryFact, marketOfCountry, monthsBetween, monthVn, QuoteFact, ShippedFact, SignedFact } from './report.rules';
import { weightedFixedPrice } from './sales.rules';

/** Hợp đồng bán cho người mua: mua đứt (ban) và môi giới (người mua ký thẳng với nhà cung cấp). */
const SALE_CONTRACT_KINDS = ['ban', 'mua_ban_truc_tiep'];
const MAX_MONTHS = 24;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Báo cáo kinh doanh theo tháng (cấp quản lý bán hàng): giá trị hợp đồng bán đã ký, khối lượng và giá trị đã giao,
 * tỷ lệ thắng của phiếu hỏi hàng và báo giá; chia theo ngành, thị trường, người mua. Quy USD theo tỷ giá của
 * hợp đồng; hợp đồng thiếu tỷ giá được đếm riêng.
 */
@Injectable()
export class ReportService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly contractsService: ContractsService,
  ) {}

  async monthly(ctx: AuthContext, q: { from?: string; to?: string }) {
    if (!ctx.permissions.includes('HOP_DONG_XEM_TAT_CA')) throw new ForbiddenException('Báo cáo kinh doanh dành cho cấp quản lý bán hàng');
    const to = q.to ?? todayVn().slice(0, 7);
    const from = q.from ?? addMonths(to, -11);
    if (!MONTH.test(from) || !MONTH.test(to)) throw new BadRequestException('Tháng dạng YYYY-MM');
    if (from > to) throw new BadRequestException('Tháng bắt đầu phải trước tháng kết thúc');
    const months = monthsBetween(from, to);
    if (months.length > MAX_MONTHS) throw new BadRequestException(`Xem tối đa ${MAX_MONTHS} tháng một lần`);

    const report = buildReport({ months, signed: await this.signed(), shipped: await this.shipped(from, to), inquiries: await this.inquiries(from, to), quotes: await this.quotes(from, to) });
    return { tuThang: from, denThang: to, ...report };
  }

  /** Hợp đồng bán đã ký; tháng là ngày ký bản gốc, giá trị theo bản đang hiệu lực (đã gồm phụ lục). */
  private async signed(): Promise<SignedFact[]> {
    const rows = await this.db
      .select({ c: contracts, sector: commodities.sector, buyerName: partners.name, country: partners.country, signedAt: contractVersions.signedAt })
      .from(contracts)
      .innerJoin(commodities, eq(commodities.id, contracts.commodityId))
      .innerJoin(partners, eq(partners.id, contracts.buyerPartnerId))
      .innerJoin(contractVersions, and(eq(contractVersions.contractId, contracts.id), eq(contractVersions.version, 1)))
      .where(and(inArray(contracts.kind, SALE_CONTRACT_KINDS), isNotNull(contracts.signedVersion), ne(contracts.status, 'da_huy'), isNotNull(contractVersions.signedAt)));
    const out: SignedFact[] = [];
    for (const r of rows) {
      const t = await this.contractsService.effectiveTerms(r.c);
      out.push({ month: monthVn(r.signedAt!), sector: r.sector, market: marketOfCountry(r.country), buyerId: r.c.buyerPartnerId!, buyerName: r.buyerName, valueUsd: contractValueUsd(t) });
    }
    return out;
  }

  /** Lô đã xếp tàu trong kỳ: khối lượng phân bổ, giá trị theo giá bán (giá trừ lùi thì giá bình quân đã chốt). */
  private async shipped(from: string, to: string): Promise<ShippedFact[]> {
    const lots = await this.db
      .select({ l: exportLots, sector: commodities.sector, buyerName: partners.name })
      .from(exportLots)
      .innerJoin(commodities, eq(commodities.id, exportLots.commodityId))
      .innerJoin(partners, eq(partners.id, exportLots.buyerPartnerId))
      .where(
        and(
          inArray(exportLots.status, ['xep_tau', 'hoan_tat']),
          isNotNull(exportLots.shippedOn),
          sql`${exportLots.shippedOn} >= ${`${from}-01`}`,
          sql`${exportLots.shippedOn} < ${`${addMonths(to, 1)}-01`}`,
        ),
      );
    if (!lots.length) return [];
    const ids = lots.map((x) => x.l.id);
    const kg = await this.db
      .select({ id: lotAllocations.exportLotId, kg: sql<number>`sum(${lotAllocations.quantityKg})::float8` })
      .from(lotAllocations)
      .where(and(inArray(lotAllocations.exportLotId, ids), isNull(lotAllocations.cancelledAt)))
      .groupBy(lotAllocations.exportLotId);
    const fixes = await this.db
      .select({ id: priceFixations.exportLotId, quantityKg: priceFixations.quantityKg, finalPrice: priceFixations.finalPrice })
      .from(priceFixations)
      .where(and(inArray(priceFixations.exportLotId, ids), isNull(priceFixations.voidedAt)));
    const out: ShippedFact[] = [];
    for (const x of lots) {
      const qty = kg.find((k) => k.id === x.l.id)?.kg ?? 0;
      const s = await this.contractsService.signedTerms(x.l.counterContractId);
      let valueUsd: number | null = null;
      if (s) {
        let perKg = s.terms.donGia / (s.terms.donVi === 'tan' ? 1000 : 1);
        if (s.terms.giaTruLui) {
          const avg = weightedFixedPrice(fixes.filter((f) => f.id === x.l.id));
          if (avg !== null) perKg = avg / 1000;
        }
        valueUsd = toUsd(qty * perKg, s.terms.tienTe, s.terms.tienTe === 'USD' ? 1 : s.terms.tyGiaUsd);
        if (valueUsd !== null) valueUsd = Math.round(valueUsd * 100) / 100;
      }
      out.push({ month: x.l.shippedOn!.slice(0, 7), sector: x.sector, market: x.l.market, buyerId: x.l.buyerPartnerId, buyerName: x.buyerName, kg: qty, valueUsd });
    }
    return out;
  }

  private async inquiries(from: string, to: string): Promise<InquiryFact[]> {
    const rows = await this.db
      .select({ receivedOn: inquiries.receivedOn, status: inquiries.status })
      .from(inquiries)
      .where(and(ne(inquiries.status, 'huy'), sql`${inquiries.receivedOn} >= ${`${from}-01`}`, sql`${inquiries.receivedOn} < ${`${addMonths(to, 1)}-01`}`));
    return rows.map((r) => ({ month: r.receivedOn.slice(0, 7), status: r.status }));
  }

  /** Báo giá bán đã gửi (bỏ bản nháp và bản huỷ). */
  private async quotes(from: string, to: string): Promise<QuoteFact[]> {
    const rows = await this.db
      .select({ createdAt: quotes.createdAt, status: quotes.status })
      .from(quotes)
      .where(
        and(
          eq(quotes.kind, 'ban'),
          inArray(quotes.status, ['da_gui', 'chap_nhan', 'tu_choi']),
          sql`${quotes.createdAt} >= ${`${from}-01T00:00:00+07:00`}::timestamptz`,
          sql`${quotes.createdAt} < ${`${addMonths(to, 1)}-01T00:00:00+07:00`}::timestamptz`,
        ),
      );
    return rows.map((r) => ({ month: monthVn(r.createdAt), status: r.status }));
  }
}
