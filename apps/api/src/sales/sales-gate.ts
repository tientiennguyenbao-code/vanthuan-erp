import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ContractTerms } from '../contracts/contract.rules';
import type { DbExecutor } from '../db/db';
import { ExportLot, lotAllocations, priceFixations, samples } from '../db/schema';
import { kgToFix, salesShippingProblems } from './sales.rules';

const toKg = (q: number, unit: string) => (unit === 'tan' ? q * 1000 : q);

/** Số liệu chốt giá của một lô xuất. */
export async function fixingState(lot: ExportLot, terms: ContractTerms, exec: DbExecutor) {
  const [{ allocated }] = await exec
    .select({ allocated: sql<number>`coalesce(sum(${lotAllocations.quantityKg}), 0)::float8` })
    .from(lotAllocations)
    .where(and(eq(lotAllocations.exportLotId, lot.id), isNull(lotAllocations.cancelledAt)));
  const [{ fixed }] = await exec
    .select({ fixed: sql<number>`coalesce(sum(${priceFixations.quantityKg}), 0)::float8` })
    .from(priceFixations)
    .where(and(eq(priceFixations.exportLotId, lot.id), isNull(priceFixations.voidedAt)));
  const plannedKg = lot.plannedKg ?? toKg(terms.soLuong, terms.donVi);
  return { allocatedKg: allocated, fixedKg: fixed, plannedKg, needFixKg: kgToFix(allocated, plannedKg) };
}

/** Điều kiện bán hàng chặn xếp tàu (Giám đốc mở chặn được như thiếu chứng từ). */
export async function salesGateProblems(lot: ExportLot, terms: ContractTerms | null, exec: DbExecutor): Promise<string[]> {
  if (!terms) return [];
  const needsSample = !!terms.duyetMauTruocXuat;
  const diff = !!terms.giaTruLui;
  if (!needsSample && !diff) return [];
  const sampleRows = needsSample ? await exec.select({ kind: samples.kind, status: samples.status }).from(samples).where(eq(samples.exportLotId, lot.id)) : [];
  const f = diff ? await fixingState(lot, terms, exec) : { needFixKg: 0, fixedKg: 0 };
  return salesShippingProblems({ needsPreShipmentSample: needsSample, samples: sampleRows, hasDifferential: diff, needFixKg: f.needFixKg, fixedKg: f.fixedKg });
}
