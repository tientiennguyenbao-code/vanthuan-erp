'use client';

import { useEffect, useState } from 'react';
import { api } from './api';
import { TRANG_THAI_HOP_DONG } from './nhan';

export interface DieuKhoan {
  soLuong: number;
  donVi: 'kg' | 'tan';
  dungSaiPhanTram: number;
  donGia: number;
  tienTe: 'USD' | 'VND' | 'EUR' | 'CNY';
  tyGiaUsd: number | null;
  incoterms: string;
  cangDi: string | null;
  cangDen: string | null;
  lichGiao: string;
  dieuKhoanThanhToan: string;
  tyLePhiPhanTram: number | null;
  ghiChu: string | null;
}

export const DIEU_KHOAN_TRONG: DieuKhoan = {
  soLuong: 0,
  donVi: 'kg',
  dungSaiPhanTram: 5,
  donGia: 0,
  tienTe: 'USD',
  tyGiaUsd: null,
  incoterms: 'FOB',
  cangDi: null,
  cangDen: null,
  lichGiao: '',
  dieuKhoanThanhToan: '',
  tyLePhiPhanTram: null,
  ghiChu: null,
};

const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];

function so(v: string): number {
  return Number(v.replace(/\s/g, '').replace(',', '.'));
}

/** Ô nhập điều khoản dùng chung cho soạn mới, sửa và lập phụ lục. */
export function NhapDieuKhoan({ v, doi, matHangId, coPhi = true }: { v: DieuKhoan; doi: (v: DieuKhoan) => void; matHangId?: string; coPhi?: boolean }) {
  const set = <K extends keyof DieuKhoan>(k: K, val: DieuKhoan[K]) => doi({ ...v, [k]: val });
  return (
    <>
      <div className="hang">
        <div><label htmlFor="sl">Số lượng</label><input id="sl" inputMode="decimal" required value={v.soLuong || ''} onChange={(e) => set('soLuong', so(e.target.value))} /></div>
        <div>
          <label htmlFor="dv">Đơn vị</label>
          <select id="dv" value={v.donVi} onChange={(e) => set('donVi', e.target.value as DieuKhoan['donVi'])}><option value="kg">kg</option><option value="tan">tấn</option></select>
        </div>
        <div><label htmlFor="ds">Dung sai (%)</label><input id="ds" inputMode="decimal" value={v.dungSaiPhanTram} onChange={(e) => set('dungSaiPhanTram', so(e.target.value) || 0)} /></div>
      </div>
      <div className="hang">
        <div><label htmlFor="dg">Đơn giá (theo đơn vị trên)</label><input id="dg" inputMode="decimal" required value={v.donGia || ''} onChange={(e) => set('donGia', so(e.target.value))} /></div>
        <div>
          <label htmlFor="tt">Tiền tệ</label>
          <select id="tt" value={v.tienTe} onChange={(e) => set('tienTe', e.target.value as DieuKhoan['tienTe'])}>
            {['USD', 'VND', 'EUR', 'CNY'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        {v.tienTe !== 'USD' && (
          <div><label htmlFor="tg">Tỷ giá: {v.tienTe} cho 1 USD</label><input id="tg" inputMode="decimal" value={v.tyGiaUsd ?? ''} onChange={(e) => set('tyGiaUsd', e.target.value ? so(e.target.value) : null)} /></div>
        )}
        <div>
          <label htmlFor="ic">Incoterms</label>
          <select id="ic" value={v.incoterms} onChange={(e) => set('incoterms', e.target.value)}>{INCOTERMS.map((i) => <option key={i}>{i}</option>)}</select>
        </div>
      </div>
      <div className="hang">
        <div><label htmlFor="cd">Cảng đi</label><input id="cd" value={v.cangDi ?? ''} onChange={(e) => set('cangDi', e.target.value || null)} /></div>
        <div><label htmlFor="cden">Cảng đến</label><input id="cden" value={v.cangDen ?? ''} onChange={(e) => set('cangDen', e.target.value || null)} /></div>
        {coPhi && <div><label htmlFor="phi">Phí trọn gói (%)</label><input id="phi" inputMode="decimal" value={v.tyLePhiPhanTram ?? ''} onChange={(e) => set('tyLePhiPhanTram', e.target.value ? so(e.target.value) : null)} /></div>}
      </div>
      {coPhi && <GoiYPhi matHangId={matHangId} tyLe={v.tyLePhiPhanTram} />}
      <label htmlFor="lg">Lịch giao hàng</label>
      <input id="lg" value={v.lichGiao} onChange={(e) => set('lichGiao', e.target.value)} placeholder="VD: Giao trước 15/01/2027 tại kho Buôn Ma Thuột" />
      <label htmlFor="tToan">Điều khoản thanh toán</label>
      <input id="tToan" value={v.dieuKhoanThanhToan} onChange={(e) => set('dieuKhoanThanhToan', e.target.value)} placeholder="VD: Đặt cọc 30%, còn lại theo chứng từ" />
      <label htmlFor="gc">Ghi chú, quy cách</label>
      <textarea id="gc" rows={3} value={v.ghiChu ?? ''} onChange={(e) => set('ghiChu', e.target.value || null)} />
    </>
  );
}

export function NhanTrangThai({ s }: { s: string }) {
  const cls = s === 'da_ky' ? 'kyc-dat' : s === 'da_huy' ? 'kyc-canh-bao' : '';
  return <span className={cls}>{TRANG_THAI_HOP_DONG[s] ?? s}</span>;
}

interface ThongKePhi {
  soHopDong: number;
  trungBinh: number | null;
  trungVi: number | null;
  thapNhat: number | null;
  caoNhat: number | null;
  san: number | null;
}

/** Gợi ý tỷ lệ phí từ các hợp đồng đã ký (cùng mặt hàng) và nhắc mức sàn. */
export function GoiYPhi({ matHangId, tyLe }: { matHangId?: string; tyLe: number | null }) {
  const [tk, setTk] = useState<ThongKePhi | null>(null);
  useEffect(() => {
    api<ThongKePhi>(`/phi/goi-y${matHangId ? `?matHangId=${matHangId}` : ''}`).then(setTk).catch(() => setTk(null));
  }, [matHangId]);
  if (!tk) return null;
  const duoiSan = tk.san !== null && tyLe !== null && tyLe < tk.san;
  return (
    <div className="phu" style={{ marginTop: 6 }}>
      {tk.soHopDong > 0
        ? <>Tham khảo {tk.soHopDong} hợp đồng đã ký{matHangId ? ' cùng mặt hàng' : ''}: phổ biến {tk.trungVi}%, trung bình {tk.trungBinh}%, từ {tk.thapNhat}% đến {tk.caoNhat}%.</>
        : <>Chưa có hợp đồng đã ký{matHangId ? ' cùng mặt hàng' : ''} để tham khảo tỷ lệ phí.</>}
      {tk.san !== null && <> Mức sàn do Ban Giám đốc đặt: {tk.san}%.</>}
      {duoiSan && <div className="kyc-canh-bao" style={{ marginTop: 4 }}>Tỷ lệ này thấp hơn mức sàn: Ban Giám đốc phải duyệt phí trước khi ký.</div>}
    </div>
  );
}
