import ExcelJS from 'exceljs';

/**
 * Tệp Excel để nhập vào MISA AMIS Kế toán. Theo thiết kế kỹ thuật: giai đoạn 1 làm theo mẫu chuẩn,
 * khi công ty đã mua AMIS thì lấy đúng tệp mẫu tải trong AMIS và chỉnh danh sách cột dưới đây (không đổi nghiệp vụ).
 */

/** Tài khoản theo Thông tư 200: phải thu khách hàng và doanh thu cung cấp dịch vụ. Kế toán trưởng chốt lại khi cài AMIS. */
export const ACCOUNTS = { debit: '131', credit: '5113' } as const;
export const FEE_ITEM = { code: 'PHI_TRON_GOI', name: 'Phí trọn gói dịch vụ xuất khẩu', unit: 'Lần' } as const;

export interface FeeExportRow {
  refNo: string;
  blDate: string;
  lotCode: string;
  purchaseLotCode: string;
  blNumber: string;
  contractCode: string;
  partnerCode: string;
  partnerName: string;
  taxCode: string | null;
  address: string | null;
  country: string;
  quantityKg: number;
  baseValue: number;
  ratePct: number;
  amount: number;
  currency: string;
  fxPerUsd: number | null;
}

type Col = { header: string; width: number; value: (r: FeeExportRow) => string | number | Date | null; numFmt?: string };

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);

/** Danh sách cột của trang "Bán dịch vụ". Đổi theo mẫu AMIS của công ty tại đây. */
export const SALE_COLUMNS: Col[] = [
  { header: 'Ngày hạch toán (*)', width: 14, value: (r) => toDate(r.blDate), numFmt: 'dd/mm/yyyy' },
  { header: 'Ngày chứng từ (*)', width: 14, value: (r) => toDate(r.blDate), numFmt: 'dd/mm/yyyy' },
  { header: 'Số chứng từ (*)', width: 26, value: (r) => r.refNo },
  { header: 'Mã khách hàng (*)', width: 16, value: (r) => r.partnerCode },
  { header: 'Tên khách hàng', width: 36, value: (r) => r.partnerName },
  { header: 'Mã số thuế', width: 14, value: (r) => r.taxCode },
  { header: 'Địa chỉ', width: 36, value: (r) => r.address },
  {
    header: 'Diễn giải',
    width: 60,
    value: (r) =>
      `Phí trọn gói lô ${r.lotCode} (lô mua ${r.purchaseLotCode}), vận đơn ${r.blNumber}, HĐ ${r.contractCode}: ${r.quantityKg.toLocaleString('vi-VN')} kg × ${r.ratePct}% giá trị`,
  },
  { header: 'Mã hàng (*)', width: 16, value: () => FEE_ITEM.code },
  { header: 'Tên hàng', width: 30, value: () => FEE_ITEM.name },
  { header: 'ĐVT', width: 8, value: () => FEE_ITEM.unit },
  { header: 'Số lượng', width: 10, value: () => 1 },
  { header: 'Đơn giá', width: 16, value: (r) => r.amount, numFmt: '#,##0.00' },
  { header: 'Thành tiền', width: 16, value: (r) => r.amount, numFmt: '#,##0.00' },
  { header: 'Loại tiền', width: 10, value: (r) => r.currency },
  // Tỷ giá quy đổi sang VND do kế toán điền theo tỷ giá ngày hạch toán (phần mềm chỉ có tỷ giá so với USD)
  { header: 'Tỷ giá', width: 10, value: (r) => (r.currency === 'VND' ? 1 : null) },
  { header: 'TK Nợ (*)', width: 10, value: () => ACCOUNTS.debit },
  { header: 'TK Có (*)', width: 10, value: () => ACCOUNTS.credit },
  { header: 'Cơ sở tính phí', width: 16, value: (r) => r.baseValue, numFmt: '#,##0.00' },
  { header: 'Tỷ lệ phí (%)', width: 12, value: (r) => r.ratePct },
];

const CUSTOMER_COLUMNS: { header: string; width: number; value: (r: FeeExportRow) => string | null }[] = [
  { header: 'Mã khách hàng (*)', width: 16, value: (r) => r.partnerCode },
  { header: 'Tên khách hàng (*)', width: 40, value: (r) => r.partnerName },
  { header: 'Mã số thuế', width: 14, value: (r) => r.taxCode },
  { header: 'Địa chỉ', width: 40, value: (r) => r.address },
  { header: 'Quốc gia', width: 10, value: (r) => r.country },
];

export function feeRefNo(lotCode: string, purchaseLotCode: string): string {
  return `PTG-${lotCode.replace(/^LX-/, '')}-${purchaseLotCode.replace(/^LM-/, '')}`;
}

/** Dựng tệp Excel; thời điểm ghi vào tệp cố định theo đợt xuất. */
export async function buildFeeWorkbook(rows: FeeExportRow[], meta: { code: string; at: Date; by: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Vạn Thuận ERP';
  wb.created = meta.at;
  wb.modified = meta.at;

  const sale = wb.addWorksheet('Ban dich vu');
  sale.columns = SALE_COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  for (const r of rows) sale.addRow(SALE_COLUMNS.map((c) => c.value(r)));
  SALE_COLUMNS.forEach((c, i) => {
    if (c.numFmt) sale.getColumn(i + 1).numFmt = c.numFmt;
  });
  sale.getRow(1).font = { bold: true };
  sale.views = [{ state: 'frozen', ySplit: 1 }];

  const cust = wb.addWorksheet('Khach hang');
  cust.columns = CUSTOMER_COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.partnerCode)) continue;
    seen.add(r.partnerCode);
    cust.addRow(CUSTOMER_COLUMNS.map((c) => c.value(r)));
  }
  cust.getRow(1).font = { bold: true };

  const note = wb.addWorksheet('Ghi chu');
  note.getColumn(1).width = 110;
  for (const line of [
    `Đợt xuất ${meta.code}, lúc ${meta.at.toISOString()}, người xuất: ${meta.by}. Số dòng: ${rows.length}.`,
    'Trang "Ban dich vu": chứng từ bán dịch vụ (phí trọn gói) để nhập vào MISA AMIS. Trang "Khach hang": nhập danh mục khách hàng trước nếu chưa có.',
    `Tài khoản: Nợ ${ACCOUNTS.debit}, Có ${ACCOUNTS.credit}. Cột Tỷ giá để trống với ngoại tệ: kế toán điền tỷ giá ngày hạch toán.`,
    'Mẫu cột theo mẫu chuẩn; khi có tệp mẫu tải từ AMIS của công ty sẽ chỉnh lại cho khớp.',
  ])
    note.addRow([line]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
