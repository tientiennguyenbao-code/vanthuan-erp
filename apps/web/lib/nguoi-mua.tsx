import Link from 'next/link';

/** Nhãn tiếng Anh cho cổng người mua (BH-5). */

export const STATUS_EN: Record<string, string> = {
  dong_goi: 'Packing',
  nhap_kho: 'In warehouse',
  giam_dinh: 'Inspection',
  dat_cho: 'Booked',
  xep_tau: 'Shipped',
  hoan_tat: 'Completed',
  da_huy: 'Cancelled',
};
export const MARKET_EN: Record<string, string> = { US: 'United States', EU: 'European Union', CN: 'China' };
export const DEAL_EN: Record<string, string> = { mua_dut: 'Direct sale by Van Thuan', moi_gioi: 'Brokered (supplier sells to you)' };
export const DOC_STATUS_EN: Record<string, string> = {
  thieu: 'Pending',
  dang_xin: 'Being issued',
  nhap: 'Draft ready',
  da_duyet: 'Checked by Van Thuan',
  da_gui: 'Sent',
};
export const STAGE_EN: Record<string, string> = { truoc_xep_tau: 'Before loading', sau_xep_tau: 'After loading', truoc_xuat: 'Before export', sau_xuat: 'After export' };
export const MILESTONE_EN: Record<string, string> = {
  dat_coc: 'Deposit',
  giam_dinh: 'After inspection',
  van_don: 'Against B/L',
  chung_tu: 'Against documents',
  giai_ngan: 'On financing',
  ngay: 'On a fixed date',
};
export const SAMPLE_EN: Record<string, string> = { chao_hang: 'Offer sample', truoc_xuat: 'Pre-shipment sample', doi_chung: 'Reference sample' };
export const SAMPLE_STATUS_EN: Record<string, string> = { chuan_bi: 'Being prepared', da_gui: 'Sent', dat: 'Approved', khong_dat: 'Rejected', luu: 'Retained', huy: 'Cancelled' };
export const COMPLAINT_KIND_EN: Record<string, string> = { so_luong: 'Quantity', chat_luong: 'Quality', chung_tu: 'Documents', cham_giao: 'Late delivery' };
export const UNIT_EN: Record<string, string> = { tan: 't', kg: 'kg' };
export const FUTURES_EN: Record<string, string> = { ICE_LONDON: 'ICE London Robusta', ICE_NY: 'ICE New York Arabica' };

export const money = (n: number | null | undefined, cur = '') =>
  n === null || n === undefined ? '—' : `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}${cur ? ` ${cur}` : ''}`;
export const dateEn = (s: string | null | undefined) => {
  if (!s) return '—';
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
};
export const tons = (kg: number | null | undefined) => (kg === null || kg === undefined ? '—' : `${(kg / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })} t`);

export interface BuyerContract {
  id: string;
  code: string;
  dealType: string;
  commodity: { code: string; name: string; hsCode: string | null };
  seller: string;
  version: number;
  signedAt: string | null;
  verificationCode: string | null;
  terms: {
    quantity: number;
    unit: string;
    tolerancePct: number;
    unitPrice: number;
    currency: string;
    incoterms: string;
    portOfLoading: string | null;
    portOfDischarge: string | null;
    shipmentSchedule: string;
    paymentTerms: string;
    instalments: { month: string; quantity: number }[];
    differential: { market: string; futuresMonth: string; differentialUsdPerTon: number } | null;
    preShipmentSample: boolean;
    creditDays: number | null;
  };
}
export interface BuyerPayment {
  id: string;
  lotId: string;
  lotCode: string;
  payTo: 'van_thuan' | 'supplier';
  milestone: string;
  dueDate: string | null;
  amount: number;
  currency: string;
  status: 'open' | 'paid';
  paidAmount: number | null;
  paidOn: string | null;
}
export function PaymentsTable({ rows, showLot }: { rows: BuyerPayment[]; showLot?: boolean }) {
  return (
    <div className="bang-cuon">
      <table>
        <thead>
          <tr>{showLot && <th>Shipment</th>}<th>Milestone</th><th>Due</th><th>Amount</th><th>Pay to</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              {showLot && <td><Link href={`/nguoi-mua/lo/${p.lotId}`}>{p.lotCode}</Link></td>}
              <td>{MILESTONE_EN[p.milestone] ?? p.milestone}</td>
              <td>{dateEn(p.dueDate)}</td>
              <td>{money(p.amount, p.currency)}</td>
              <td>{p.payTo === 'supplier' ? 'Supplier (direct)' : 'Van Thuan Global'}</td>
              <td className={p.status === 'paid' ? 'kyc-dat' : ''}>{p.status === 'paid' ? `Paid ${dateEn(p.paidOn)}` : 'Open'}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={showLot ? 6 : 5} className="phu">No payments scheduled yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

