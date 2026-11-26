import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AuditService } from "../audit/audit.service";
import type { AuthContext } from "../auth/auth.types";
import { ContractsService } from "../contracts/contracts.service";
import { DB, Db } from "../db/db";
import {
  Contract,
  CreditLimit,
  creditLimits,
  partnerRoles,
  partners,
  users,
} from "../db/schema";
import {
  activeLimit,
  buyerExposure,
  openReceivables,
  pendingDeferredContracts,
  todayVn,
} from "./credit-gate";
import {
  AGING_BUCKETS,
  agingSummary,
  BLOCK_OVERDUE_DAYS,
  daysOverdue,
} from "./credit.rules";

/** Công nợ, tuổi nợ và hạn mức nợ của người mua (BH-3). */
@Injectable()
export class CreditService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly contracts: ContractsService,
    private readonly audit: AuditService,
  ) {}

  private assertView(ctx: AuthContext) {
    if (!ctx.permissions.includes("CONG_NO_XEM"))
      throw new ForbiddenException("Bạn không có quyền xem công nợ người mua");
  }
  private termsOf = (c: Contract) => this.contracts.effectiveTerms(c, this.db);

  /** Bảng công nợ tất cả người mua. */
  async list(ctx: AuthContext) {
    this.assertView(ctx);
    const today = todayVn();
    const buyers = await this.db
      .select({
        id: partners.id,
        code: partners.code,
        name: partners.name,
        country: partners.country,
      })
      .from(partners)
      .innerJoin(
        partnerRoles,
        and(
          eq(partnerRoles.partnerId, partners.id),
          eq(partnerRoles.role, "nguoi_mua"),
        ),
      )
      .orderBy(partners.name);
    const rec = await openReceivables(null, this.db);
    const limits = await this.db
      .select()
      .from(creditLimits)
      .orderBy(desc(creditLimits.proposedAt));
    const out: Awaited<ReturnType<CreditService["row"]>>[] = [];
    for (const b of buyers) out.push(await this.row(b, rec, limits, today));
    const sum = (f: (x: (typeof out)[number]) => number) =>
      Math.round(out.reduce((a, x) => a + f(x), 0) * 100) / 100;
    return {
      nguoiMua: out,
      tong: {
        duNo: sum((x) => x.duNo),
        quaHan: sum((x) => x.tuoiNo.overdue),
        theoNhom: Object.fromEntries(
          AGING_BUCKETS.map((k) => [k, sum((x) => x.tuoiNo.buckets[k])]),
        ),
        soBiChan: out.filter((x) => x.biChan).length,
      },
      quyen: {
        deXuat: ctx.permissions.includes("HAN_MUC_DE_XUAT"),
        duyet: ctx.permissions.includes("HAN_MUC_DUYET"),
      },
    };
  }

  private async row(
    b: { id: string; code: string; name: string; country: string },
    rec: Awaited<ReturnType<typeof openReceivables>>,
    limits: CreditLimit[],
    today: string,
  ) {
    const aging = agingSummary(
      rec.filter((r) => r.partnerId === b.id),
      today,
    );
    const pending = await pendingDeferredContracts(
      b.id,
      null,
      this.termsOf,
      this.db,
    );
    const pendingUsd =
      Math.round(pending.reduce((a, p) => a + (p.usd ?? 0), 0) * 100) / 100;
    const mine = limits.filter((l) => l.partnerId === b.id);
    const active =
      mine
        .filter((l) => l.status === "da_duyet")
        .sort((x, y) => +(y.decidedAt ?? 0) - +(x.decidedAt ?? 0))[0] ?? null;
    const proposal = mine.find((l) => l.status === "de_xuat") ?? null;
    const exposure = Math.round((aging.total + pendingUsd) * 100) / 100;
    return {
      ...b,
      tuoiNo: aging,
      hopDongChoLenLich: pendingUsd,
      duNo: exposure,
      hanMuc: active
        ? { amountUsd: active.amountUsd, maxDays: active.maxDays }
        : null,
      conLai: active
        ? Math.round((active.amountUsd - exposure) * 100) / 100
        : null,
      dangDeXuat: proposal
        ? {
            id: proposal.id,
            amountUsd: proposal.amountUsd,
            maxDays: proposal.maxDays,
          }
        : null,
      biChan: aging.maxOverdueDays > BLOCK_OVERDUE_DAYS,
    };
  }

  /** Chi tiết công nợ một người mua: từng khoản phải thu, hợp đồng trả chậm chưa lên lịch, lịch sử hạn mức. */
  async get(partnerId: string, ctx: AuthContext) {
    this.assertView(ctx);
    const [p] = await this.db
      .select({
        id: partners.id,
        code: partners.code,
        name: partners.name,
        country: partners.country,
      })
      .from(partners)
      .where(eq(partners.id, partnerId));
    if (!p) throw new NotFoundException("Không tìm thấy người mua");
    const today = todayVn();
    const ex = await buyerExposure(partnerId, null, this.termsOf, this.db);
    const limit = await activeLimit(partnerId, this.db);
    const proposer = alias(users, "nguoi_de_xuat");
    const decider = alias(users, "nguoi_duyet");
    const history = await this.db
      .select({
        l: creditLimits,
        proposedByName: proposer.fullName,
        decidedByName: decider.fullName,
      })
      .from(creditLimits)
      .innerJoin(proposer, eq(proposer.id, creditLimits.proposedBy))
      .leftJoin(decider, eq(decider.id, creditLimits.decidedBy))
      .where(eq(creditLimits.partnerId, partnerId))
      .orderBy(desc(creditLimits.proposedAt));
    return {
      ...p,
      tuoiNo: ex.aging,
      duNo: ex.exposureUsd,
      hanMuc: limit
        ? { amountUsd: limit.amountUsd, maxDays: limit.maxDays }
        : null,
      conLai: limit
        ? Math.round((limit.amountUsd - ex.exposureUsd) * 100) / 100
        : null,
      biChan: ex.aging.maxOverdueDays > BLOCK_OVERDUE_DAYS,
      khoanPhaiThu: ex.receivables
        .map((r) => ({
          id: r.id,
          exportLotId: r.exportLotId,
          lotCode: r.lotCode,
          milestone: r.milestone,
          dueDate: r.dueDate,
          amount: r.amount,
          currency: r.currency,
          amountUsd: r.amountUsd,
          soNgayQuaHan: daysOverdue(r.dueDate, today),
        }))
        .sort((a, b) =>
          (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
        ),
      hopDongChoLenLich: ex.pending,
      lichSuHanMuc: history.map((h) => ({
        ...h.l,
        proposedByName: h.proposedByName,
        decidedByName: h.decidedByName,
      })),
      quyen: {
        deXuat:
          ctx.permissions.includes("HAN_MUC_DE_XUAT") &&
          !history.some((h) => h.l.status === "de_xuat"),
        duyet: ctx.permissions.includes("HAN_MUC_DUYET"),
      },
    };
  }

  async propose(
    partnerId: string,
    input: { amountUsd: number; maxDays: number; reason: string },
    ctx: AuthContext,
  ) {
    if (!ctx.permissions.includes("HAN_MUC_DE_XUAT"))
      throw new ForbiddenException("Chỉ Kế toán trưởng đề xuất hạn mức nợ");
    return this.db.transaction(async (tx) => {
      const [role] = await tx
        .select()
        .from(partnerRoles)
        .where(
          and(
            eq(partnerRoles.partnerId, partnerId),
            eq(partnerRoles.role, "nguoi_mua"),
          ),
        );
      if (!role)
        throw new BadRequestException("Đối tác này không phải người mua");
      const [open] = await tx
        .select({ id: creditLimits.id })
        .from(creditLimits)
        .where(
          and(
            eq(creditLimits.partnerId, partnerId),
            eq(creditLimits.status, "de_xuat"),
          ),
        );
      if (open)
        throw new BadRequestException(
          "Người mua đang có một đề xuất hạn mức chờ Giám đốc duyệt",
        );
      const [r] = await tx
        .insert(creditLimits)
        .values({
          partnerId,
          amountUsd: input.amountUsd,
          maxDays: input.maxDays,
          reason: input.reason,
          proposedBy: ctx.user.id,
        })
        .returning();
      await this.audit.record(
        {
          actorUserId: ctx.user.id,
          action: "han_muc.de_xuat",
          entityType: "partner",
          entityId: partnerId,
          detail: { hanMucUsd: input.amountUsd, soNgay: input.maxDays },
        },
        tx,
      );
      return { id: r.id };
    });
  }

  async decide(
    id: string,
    input: { approve: boolean; note: string | null },
    ctx: AuthContext,
  ) {
    if (!ctx.permissions.includes("HAN_MUC_DUYET"))
      throw new ForbiddenException("Chỉ Giám đốc duyệt hạn mức nợ");
    await this.db.transaction(async (tx) => {
      const [l] = await tx
        .select()
        .from(creditLimits)
        .where(eq(creditLimits.id, id))
        .for("update");
      if (!l) throw new NotFoundException("Không tìm thấy đề xuất hạn mức");
      if (l.status !== "de_xuat")
        throw new BadRequestException("Đề xuất này đã được xử lý");
      if (l.proposedBy === ctx.user.id)
        throw new ForbiddenException(
          "Người đề xuất không tự duyệt hạn mức (nguyên tắc 4 mắt)",
        );
      if (!input.approve && !input.note)
        throw new BadRequestException("Từ chối phải ghi lý do");
      await tx
        .update(creditLimits)
        .set({
          status: input.approve ? "da_duyet" : "tu_choi",
          decidedBy: ctx.user.id,
          decidedAt: new Date(),
          decisionNote: input.note,
        })
        .where(eq(creditLimits.id, id));
      await this.audit.record(
        {
          actorUserId: ctx.user.id,
          action: input.approve ? "han_muc.duyet" : "han_muc.tu_choi",
          entityType: "partner",
          entityId: l.partnerId,
          detail: {
            hanMucUsd: l.amountUsd,
            soNgay: l.maxDays,
            ghiChu: input.note,
          },
        },
        tx,
      );
    });
  }
}
