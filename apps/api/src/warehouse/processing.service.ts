import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.types';
import { DB, Db, DbExecutor } from '../db/db';
import {
  commodities,
  facilities,
  facilityKeepers,
  facilityZones,
  goodsReceipts,
  partners,
  processingInputs,
  processingNorms,
  ProcessingOrder,
  processingOrders,
  purchaseLots,
  stockLotOrigins,
  stockLots,
  stockMoves,
  stockTransfers,
  users,
} from '../db/schema';
import { blendShares, capacityRefusal, inputsRefusal, massBalance, needsApproval, PROCESSING_STEPS, stepLabel, zoneRefusal } from './kho.rules';

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface OrderInput {
  facilityId: string;
  step: string;
  processedOn: string;
  inputs: { stockLotId: string; quantityKg: number }[];
  outputs: { kind: 'thanh_pham' | 'phu_pham'; grade: string | null; quantityKg: number; bags: number | null; zoneId: string }[];
  overReason: string | null;
  note: string | null;
}

@Injectable()
export class ProcessingService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  private assertView(ctx: AuthContext) {
    if (!ctx.permissions.includes('KHO_XEM')) throw new ForbiddenException('Bạn không có quyền xem kho');
  }

  // ---------- Định mức ----------

  async listNorms(ctx: AuthContext) {
    this.assertView(ctx);
    const rows = await this.db.select({ n: processingNorms, by: users.fullName }).from(processingNorms).innerJoin(users, eq(users.id, processingNorms.setBy));
    const set = new Map(rows.map((r) => [`${r.n.sector}:${r.n.step}`, r]));
    return {
      dinhMuc: Object.entries(PROCESSING_STEPS).flatMap(([sector, steps]) =>
        Object.entries(steps).map(([step, label]) => {
          const r = set.get(`${sector}:${step}`);
          return { sector, step, label, maxLossPct: r?.n.maxLossPct ?? null, setByName: r?.by ?? null, setAt: r?.n.setAt ?? null };
        }),
      ),
      quyen: { dat: ctx.permissions.includes('SO_CHE_DINH_MUC') },
    };
  }

  async setNorm(sector: string, step: string, maxLossPct: number, ctx: AuthContext) {
    if (!ctx.permissions.includes('SO_CHE_DINH_MUC')) throw new ForbiddenException('Chỉ Giám đốc, Phó Giám đốc đặt định mức hao hụt');
    if (!PROCESSING_STEPS[sector]?.[step]) throw new BadRequestException('Công đoạn không có trong ngành này');
    await this.db.transaction(async (tx) => {
      await tx
        .insert(processingNorms)
        .values({ sector, step, maxLossPct, setBy: ctx.user.id })
        .onConflictDoUpdate({ target: [processingNorms.sector, processingNorms.step], set: { maxLossPct, setBy: ctx.user.id, setAt: new Date() } });
      await this.audit.record({ actorUserId: ctx.user.id, action: 'so_che.dat_dinh_muc', entityType: 'processing_norm', detail: { nganh: sector, congDoan: step, phanTram: maxLossPct } }, tx);
    });
  }

  // ---------- Lệnh sơ chế ----------

  async createOrder(input: OrderInput, ctx: AuthContext) {
    if (input.processedOn > new Date().toISOString().slice(0, 10)) throw new BadRequestException('Ngày sơ chế không được ở tương lai');
    if (new Set(input.inputs.map((i) => i.stockLotId)).size !== input.inputs.length) throw new BadRequestException('Một lô tồn chỉ ghi một lần trong lệnh');
    return this.db.transaction(async (tx) => {
      if (!ctx.permissions.includes('KHO_GHI_PHIEU')) throw new ForbiddenException('Chỉ thủ kho ghi lệnh sơ chế');
      const [k] = await tx.select().from(facilityKeepers).where(and(eq(facilityKeepers.facilityId, input.facilityId), eq(facilityKeepers.userId, ctx.user.id)));
      if (!k) throw new ForbiddenException('Bạn chưa được giao kho này');
      // Khoá các lô đầu vào theo thứ tự mã để hai lệnh cùng lúc không lấy trùng hàng
      const ids = input.inputs.map((i) => i.stockLotId).sort();
      const lots = ids.length ? await tx.select().from(stockLots).where(inArray(stockLots.id, ids)).orderBy(asc(stockLots.id)).for('update') : [];
      if (lots.length !== ids.length) throw new NotFoundException('Không tìm thấy lô tồn đầu vào');
      const origins = ids.length ? await tx.select({ o: stockLotOrigins, supplierId: purchaseLots.supplierPartnerId }).from(stockLotOrigins).innerJoin(purchaseLots, eq(purchaseLots.id, stockLotOrigins.purchaseLotId)).where(inArray(stockLotOrigins.stockLotId, ids)) : [];
      const byId = new Map(lots.map((l) => [l.id, l]));
      const facts = input.inputs.map((i) => {
        const l = byId.get(i.stockLotId)!;
        const os = origins.filter((o) => o.o.stockLotId === l.id);
        return { lot: l, origins: os.map((o) => o.o), fact: { code: l.code, facilityId: l.facilityId, commodityId: l.commodityId, dealType: l.dealType, eudrClass: l.eudrClass, status: l.status, remainingKg: l.remainingKg, supplierIds: [...new Set(os.map((o) => o.supplierId))], quantityKg: i.quantityKg } };
      });
      const refusal = inputsRefusal(input.facilityId, facts.map((f) => f.fact));
      if (refusal) throw new BadRequestException(refusal);
      const first = facts[0].lot;
      if (facts.some((f) => f.lot.kind === 'phu_pham')) throw new BadRequestException('Phụ phẩm không đưa vào sơ chế hàng xuất khẩu');
      const [com] = await tx.select().from(commodities).where(eq(commodities.id, first.commodityId));
      if (!PROCESSING_STEPS[com.sector]?.[input.step]) throw new BadRequestException(`Công đoạn này không dùng cho ngành ${com.sector}`);
      const inputKg = r2(input.inputs.reduce((s, i) => s + i.quantityKg, 0));
      const bal = massBalance(input.step, inputKg, input.outputs);
      if ('error' in bal) throw new BadRequestException(bal.error);
      const [norm] = await tx.select().from(processingNorms).where(and(eq(processingNorms.sector, com.sector), eq(processingNorms.step, input.step)));
      const normPct = norm?.maxLossPct ?? null;
      const hold = needsApproval(input.step, bal.lossPct, normPct);
      if (hold && !input.overReason) {
        throw new BadRequestException(
          normPct === null
            ? `Công đoạn ${stepLabel(com.sector, input.step)} chưa có định mức hao hụt: ghi lý do để trình Giám đốc duyệt`
            : `Hao hụt ${bal.lossPct}% vượt định mức ${normPct}%: ghi lý do để trình Giám đốc duyệt`,
        );
      }
      // Khu của từng dòng ra: đúng nhãn và còn chỗ
      const zoneIds = [...new Set(input.outputs.map((o) => o.zoneId))];
      const zones = await tx.select().from(facilityZones).where(inArray(facilityZones.id, zoneIds)).for('update');
      const freed = new Map<string, number>();
      for (const f of facts) freed.set(f.lot.zoneId, (freed.get(f.lot.zoneId) ?? 0) + f.fact.quantityKg);
      for (const z of zones) {
        if (z.facilityId !== input.facilityId) throw new BadRequestException(`${z.name} không thuộc kho này`);
        const bad = zoneRefusal({ sector: com.sector, eudrClass: first.eudrClass }, z);
        if (bad) throw new BadRequestException(bad);
        const [{ kg }] = await tx.select({ kg: sql<number>`coalesce(sum(${stockLots.remainingKg}), 0)::float8` }).from(stockLots).where(eq(stockLots.zoneId, z.id));
        const add = input.outputs.filter((o) => o.zoneId === z.id).reduce((s, o) => s + o.quantityKg, 0);
        const cap = capacityRefusal(z, kg - (freed.get(z.id) ?? 0), add);
        if (cap) throw new BadRequestException(cap);
      }
      if (zones.length !== zoneIds.length) throw new NotFoundException('Không tìm thấy khu đầu ra');

      const year = input.processedOn.slice(0, 4);
      const code = await this.nextCode(tx, `LSC-${year}-`, 4, processingOrders.code);
      const [o] = await tx
        .insert(processingOrders)
        .values({
          code,
          facilityId: input.facilityId,
          commodityId: first.commodityId,
          step: input.step,
          processedOn: input.processedOn,
          inputKg: bal.inputKg,
          outputKg: bal.outputKg,
          byproductKg: bal.byproductKg,
          lossKg: bal.lossKg,
          lossPct: bal.lossPct,
          normPct,
          status: hold ? 'cho_duyet' : 'xong',
          overReason: hold ? input.overReason : null,
          note: input.note,
          createdBy: ctx.user.id,
        })
        .returning({ id: processingOrders.id });
      for (const f of facts) {
        await tx.insert(processingInputs).values({ orderId: o.id, stockLotId: f.lot.id, quantityKg: r2(f.fact.quantityKg) });
        await tx.update(stockLots).set({ remainingKg: r2(f.lot.remainingKg - f.fact.quantityKg) }).where(eq(stockLots.id, f.lot.id));
        await tx.insert(stockMoves).values({ stockLotId: f.lot.id, kind: 'so_che_vao', quantityKg: -r2(f.fact.quantityKg), fromZoneId: f.lot.zoneId, refId: o.id, note: code, actorUserId: ctx.user.id });
      }
      const shares = blendShares(facts.map((f) => ({ quantityKg: f.fact.quantityKg, origins: f.origins })));
      const outCodes: string[] = [];
      for (const out of input.outputs) {
        const sc = await this.nextCode(tx, `LT-${year}-`, 5, stockLots.code);
        const [s] = await tx
          .insert(stockLots)
          .values({
            code: sc,
            facilityId: input.facilityId,
            zoneId: out.zoneId,
            commodityId: first.commodityId,
            kind: out.kind,
            grade: out.grade,
            dealType: first.dealType,
            eudrClass: first.eudrClass,
            initialKg: r2(out.quantityKg),
            remainingKg: r2(out.quantityKg),
            bags: out.bags,
            source: 'so_che',
            processingOrderId: o.id,
            status: hold ? 'cho_duyet' : 'san_sang',
            receivedOn: input.processedOn,
            createdBy: ctx.user.id,
          })
          .returning({ id: stockLots.id });
        await tx.insert(stockLotOrigins).values(shares.map((sh) => ({ stockLotId: s.id, purchaseLotId: sh.purchaseLotId, share: sh.share })));
        await tx.insert(stockMoves).values({ stockLotId: s.id, kind: 'so_che_ra', quantityKg: r2(out.quantityKg), toZoneId: out.zoneId, refId: o.id, note: code, actorUserId: ctx.user.id });
        outCodes.push(sc);
      }
      await this.audit.record(
        { actorUserId: ctx.user.id, action: 'so_che.ghi_lenh', entityType: 'processing_order', entityId: o.id, detail: { ma: code, congDoan: input.step, vaoKg: bal.inputKg, haoHutPhanTram: bal.lossPct, dinhMuc: normPct, choDuyet: hold } },
        tx,
      );
      return { id: o.id, code, status: hold ? 'cho_duyet' : 'xong', ...bal, normPct, outputCodes: outCodes };
    });
  }

  /** Giám đốc, Phó Giám đốc duyệt hao hụt vượt định mức. Từ chối thì trả hàng về các lô đầu vào và huỷ đầu ra. */
  async decide(id: string, approve: boolean, note: string | null, ctx: AuthContext) {
    if (!ctx.permissions.includes('SO_CHE_DUYET')) throw new ForbiddenException('Chỉ Giám đốc, Phó Giám đốc duyệt hao hụt vượt định mức');
    if (!approve && !note) throw new BadRequestException('Ghi lý do từ chối');
    await this.db.transaction(async (tx) => {
      const [o] = await tx.select().from(processingOrders).where(eq(processingOrders.id, id)).for('update');
      if (!o) throw new NotFoundException('Không tìm thấy lệnh sơ chế');
      if (o.status !== 'cho_duyet') throw new BadRequestException('Lệnh không ở trạng thái chờ duyệt');
      const outs = await tx.select().from(stockLots).where(eq(stockLots.processingOrderId, id)).for('update');
      if (approve) {
        await tx.update(stockLots).set({ status: 'san_sang' }).where(eq(stockLots.processingOrderId, id));
      } else {
        for (const s of outs) {
          await tx.update(stockLots).set({ status: 'huy', remainingKg: 0 }).where(eq(stockLots.id, s.id));
          await tx.insert(stockMoves).values({ stockLotId: s.id, kind: 'huy_so_che', quantityKg: -s.remainingKg, fromZoneId: s.zoneId, refId: id, note: o.code, actorUserId: ctx.user.id });
        }
        const ins = await tx.select().from(processingInputs).where(eq(processingInputs.orderId, id));
        for (const i of ins) {
          const [l] = await tx.select().from(stockLots).where(eq(stockLots.id, i.stockLotId)).for('update');
          await tx.update(stockLots).set({ remainingKg: r2(l.remainingKg + i.quantityKg) }).where(eq(stockLots.id, l.id));
          await tx.insert(stockMoves).values({ stockLotId: l.id, kind: 'tra_lai_so_che', quantityKg: i.quantityKg, toZoneId: l.zoneId, refId: id, note: o.code, actorUserId: ctx.user.id });
        }
      }
      await tx.update(processingOrders).set({ status: approve ? 'xong' : 'tu_choi', decidedBy: ctx.user.id, decidedAt: new Date(), decisionNote: note }).where(eq(processingOrders.id, id));
      await this.audit.record({ actorUserId: ctx.user.id, action: approve ? 'so_che.duyet' : 'so_che.tu_choi', entityType: 'processing_order', entityId: id, detail: { ma: o.code, ghiChu: note } }, tx);
    });
  }

  async listOrders(ctx: AuthContext, filter: { facilityId?: string; status?: string }) {
    this.assertView(ctx);
    const conds = [];
    if (filter.facilityId) conds.push(eq(processingOrders.facilityId, filter.facilityId));
    if (filter.status) conds.push(eq(processingOrders.status, filter.status));
    const rows = await this.db
      .select({ o: processingOrders, facilityName: facilities.name, commodityName: commodities.name, sector: commodities.sector, by: users.fullName })
      .from(processingOrders)
      .innerJoin(facilities, eq(facilities.id, processingOrders.facilityId))
      .innerJoin(commodities, eq(commodities.id, processingOrders.commodityId))
      .innerJoin(users, eq(users.id, processingOrders.createdBy))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(processingOrders.createdAt))
      .limit(500);
    const ids = rows.map((r) => r.o.id);
    const ins = ids.length
      ? await this.db.select({ orderId: processingInputs.orderId, stockLotId: processingInputs.stockLotId, kg: processingInputs.quantityKg, code: stockLots.code }).from(processingInputs).innerJoin(stockLots, eq(stockLots.id, processingInputs.stockLotId)).where(inArray(processingInputs.orderId, ids))
      : [];
    const outs = ids.length
      ? await this.db.select({ s: stockLots, zoneCode: facilityZones.code }).from(stockLots).innerJoin(facilityZones, eq(facilityZones.id, stockLots.zoneId)).where(inArray(stockLots.processingOrderId, ids)).orderBy(asc(stockLots.code))
      : [];
    const approve = ctx.permissions.includes('SO_CHE_DUYET');
    return rows.map((r) => ({
      ...r.o,
      stepLabel: stepLabel(r.sector, r.o.step),
      facilityName: r.facilityName,
      commodityName: r.commodityName,
      sector: r.sector,
      createdByName: r.by,
      dauVao: ins.filter((i) => i.orderId === r.o.id).map((i) => ({ stockLotId: i.stockLotId, code: i.code, quantityKg: i.kg })),
      dauRa: outs.filter((x) => x.s.processingOrderId === r.o.id).map((x) => ({ id: x.s.id, code: x.s.code, kind: x.s.kind, grade: x.s.grade, initialKg: x.s.initialKg, zoneCode: x.zoneCode, status: x.s.status })),
      quyen: { duyet: approve && r.o.status === 'cho_duyet' },
    }));
  }

  // ---------- Truy xuất qua sơ chế ----------

  /**
   * Lần ngược một lô tồn về hàng nhận vào kho: qua các lệnh sơ chế và các lần tách lô, đến phiếu nhận hàng và lô mua.
   * Trả về danh sách các bước (mới trước) để vẽ thành chuỗi.
   */
  async trace(stockLotId: string, ctx: AuthContext) {
    this.assertView(ctx);
    const steps: { level: number; kind: string; ref: string; label: string; detail: string; lots: string[] }[] = [];
    const seen = new Set<string>();
    const walk = async (id: string, level: number) => {
      if (seen.has(id) || level > 30) return;
      seen.add(id);
      const [s] = await this.db.select().from(stockLots).where(eq(stockLots.id, id));
      if (!s) return;
      if (s.source === 'so_che' && s.processingOrderId) {
        const [o] = await this.db.select({ o: processingOrders, sector: commodities.sector }).from(processingOrders).innerJoin(commodities, eq(commodities.id, processingOrders.commodityId)).where(eq(processingOrders.id, s.processingOrderId));
        const ins = await this.db.select({ id: stockLots.id, code: stockLots.code, kg: processingInputs.quantityKg }).from(processingInputs).innerJoin(stockLots, eq(stockLots.id, processingInputs.stockLotId)).where(eq(processingInputs.orderId, o.o.id));
        if (!steps.some((x) => x.ref === o.o.code)) {
          steps.push({ level, kind: 'so_che', ref: o.o.code, label: stepLabel(o.sector, o.o.step), detail: orderDetail(o.o), lots: ins.map((i) => `${i.code} (${r2(i.kg).toLocaleString('vi-VN')} kg)`) });
        }
        for (const i of ins) await walk(i.id, level + 1);
      } else if (s.source === 'chuyen_kho' && s.parentId) {
        const [t] = await this.db
          .select({ t: stockTransfers, fromName: facilities.name, parentCode: sql<string>`(select code from stock_lots p where p.id = ${stockTransfers.stockLotId})` })
          .from(stockTransfers)
          .innerJoin(facilities, eq(facilities.id, stockTransfers.fromFacilityId))
          .where(eq(stockTransfers.receivedStockLotId, id));
        if (t) {
          const f = (n: number) => r2(n).toLocaleString('vi-VN');
          steps.push({ level, kind: 'chuyen_kho', ref: t.t.code, label: 'Chuyển kho', detail: `từ ${t.fromName}: gửi ${f(t.t.quantityKg)} kg ngày ${dmy(t.t.sentOn)}, nhận ${f(t.t.receivedKg ?? 0)} kg ngày ${dmy(t.t.receivedOn ?? t.t.sentOn)}`, lots: [t.parentCode] });
        }
        await walk(s.parentId, level + 1);
      } else if (s.source === 'tach_lo' && s.parentId) {
        const [p] = await this.db.select({ code: stockLots.code }).from(stockLots).where(eq(stockLots.id, s.parentId));
        steps.push({ level, kind: 'tach_lo', ref: s.code, label: 'Tách lô', detail: `${s.code} tách từ ${p.code}`, lots: [p.code] });
        await walk(s.parentId, level + 1);
      } else {
        const [g] = await this.db
          .select({ g: goodsReceipts, lotCode: purchaseLots.code, supplierName: partners.name })
          .from(goodsReceipts)
          .innerJoin(purchaseLots, eq(purchaseLots.id, goodsReceipts.purchaseLotId))
          .innerJoin(partners, eq(partners.id, purchaseLots.supplierPartnerId))
          .where(eq(goodsReceipts.stockLotId, id));
        if (g) {
          steps.push({ level, kind: 'nhan_hang', ref: g.g.code, label: 'Nhận hàng', detail: `${s.code}: ${r2(g.g.quantityKg).toLocaleString('vi-VN')} kg ngày ${dmy(g.g.receivedOn)}${g.g.vehicleNo ? `, xe ${g.g.vehicleNo}` : ''}`, lots: [`${g.lotCode} · ${g.supplierName}`] });
        }
      }
    };
    await walk(stockLotId, 0);
    return { buoc: steps };
  }

  private async nextCode(tx: DbExecutor, prefix: string, width: number, col: typeof processingOrders.code | typeof stockLots.code) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'kho_code:' + prefix}))`);
    const table = col === processingOrders.code ? processingOrders : stockLots;
    const [{ max }] = await tx
      .select({ max: sql<number | null>`max(substring(${col}, ${prefix.length + 1}::int)::int)` })
      .from(table)
      .where(sql`${col} like ${prefix + '%'}`);
    return `${prefix}${String((max ?? 0) + 1).padStart(width, '0')}`;
  }
}

function orderDetail(o: ProcessingOrder): string {
  const f = (n: number) => r2(n).toLocaleString('vi-VN');
  return `vào ${f(o.inputKg)} kg, ra ${f(o.outputKg)} kg${o.byproductKg ? ` + phụ phẩm ${f(o.byproductKg)} kg` : ''}, hao hụt ${f(o.lossPct)}% ngày ${dmy(o.processedOn)}`;
}

function dmy(d: string): string {
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}
