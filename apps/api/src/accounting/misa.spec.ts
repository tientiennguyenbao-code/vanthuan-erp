import ExcelJS from 'exceljs';
import { buildFeeWorkbook, FeeExportRow, feeRefNo, SALE_COLUMNS } from './misa';

const row = (over: Partial<FeeExportRow> = {}): FeeExportRow => ({
  refNo: 'PTG-2601-0001-2601-0003',
  blDate: '2027-01-20',
  lotCode: 'LX-2601-0001',
  purchaseLotCode: 'LM-2601-0003',
  blNumber: 'BL-1',
  contractCode: 'HD-1',
  partnerCode: 'NCC01',
  partnerName: 'Công ty A',
  taxCode: '0312345678',
  address: 'TP.HCM',
  country: 'VN',
  quantityKg: 10000,
  baseValue: 48000,
  ratePct: 1.5,
  amount: 720,
  currency: 'USD',
  fxPerUsd: 1,
  ...over,
});

describe('Tệp Excel MISA', () => {
  it('số chứng từ bỏ tiền tố LX-/LM-', () => {
    expect(feeRefNo('LX-2601-0001', 'LM-2601-0003')).toBe('PTG-2601-0001-2601-0003');
  });

  it('một dòng mỗi đề nghị, khách hàng không lặp', async () => {
    const at = new Date('2027-01-21T03:00:00Z');
    const buf = await buildFeeWorkbook([row(), row({ refNo: 'PTG-2', amount: 100, currency: 'VND', fxPerUsd: 25000 })], { code: 'MISA-20270121-01', at, by: 'Kế toán' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Ban dich vu', 'Khach hang', 'Ghi chu']);
    const sale = wb.getWorksheet('Ban dich vu')!;
    expect(sale.rowCount).toBe(3);
    expect(sale.getRow(1).getCell(1).value).toBe(SALE_COLUMNS[0].header);
    const col = (h: string) => SALE_COLUMNS.findIndex((c) => c.header === h) + 1;
    expect(sale.getRow(2).getCell(col('Thành tiền')).value).toBe(720);
    expect(sale.getRow(2).getCell(col('Tỷ giá')).value).toBeNull();
    expect(sale.getRow(3).getCell(col('Tỷ giá')).value).toBe(1);
    expect((sale.getRow(2).getCell(col('Ngày hạch toán (*)')).value as Date).toISOString().slice(0, 10)).toBe('2027-01-20');
    expect(wb.getWorksheet('Khach hang')!.rowCount).toBe(2);
    expect(String(wb.getWorksheet('Ghi chu')!.getRow(1).getCell(1).value)).toContain('MISA-20270121-01');
  });
});
