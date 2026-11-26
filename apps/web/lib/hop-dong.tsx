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
  /** Hợp đồng bán giao nhiều đợt: mỗi đợt một lô xuất */
  dotGiao?: { thang: string; soLuong: number }[] | null;
  /** Người mua phải duyệt mẫu trước xuất mới được xếp tàu */
  duyetMauTruocXuat?: boolean | null;
  /** Cà phê bán theo giá trừ lùi: giá sàn kỳ hạn + chênh lệch (USD/tấn) */
  giaTruLui?: { san: 'ICE_LONDON' | 'ICE_NY'; kyHan: string; chenhLech: number } | null;
  /** Bán trả chậm: người mua trả sau số ngày này kể từ ngày tàu chạy (cần hạn mức nợ) */
  traChamNgay?: number | null;
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
export function NhapDieuKhoan({ v, doi, matHangId, coPhi = true, coBan = false }: { v: DieuKhoan; doi: (v: DieuKhoan) => void; matHangId?: string; coPhi?: boolean; coBan?: boolean }) {
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
      {coBan && <DieuKhoanBan v={v} doi={doi} />}
    </>
  );
}

/** Điều khoản riêng của hợp đồng bán: giao nhiều đợt, duyệt mẫu trước xuất, giá trừ lùi cà phê. */
function DieuKhoanBan({ v, doi }: { v: DieuKhoan; doi: (v: DieuKhoan) => void }) {
  const dots = v.dotGiao ?? [];
  const tong = dots.reduce((a, d) => a + (d.soLuong || 0), 0);
  const lech = dots.length > 0 && Math.abs(tong - v.soLuong) > 0.0005;
  const setDot = (i: number, k: 'thang' | 'soLuong', val: string | number) => doi({ ...v, dotGiao: dots.map((d, j) => (j === i ? { ...d, [k]: val } : d)) });
  const g = v.giaTruLui ?? null;
  const dv = v.donVi === 'tan' ? 'tấn' : 'kg';
  return (
    <fieldset className="o" style={{ marginTop: 12 }}>
      <legend><strong>Điều khoản bán hàng</strong></legend>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={dots.length > 0} onChange={(e) => doi({ ...v, dotGiao: e.target.checked ? [{ thang: '', soLuong: v.soLuong / 2 }, { thang: '', soLuong: v.soLuong / 2 }] : null })} />
        Giao nhiều đợt (mỗi đợt một lô xuất)
      </label>
      {dots.length > 0 && (
        <>
          {dots.map((d, i) => (
            <div className="hang" key={i}>
              <div><label htmlFor={`dt${i}`}>Đợt {i + 1}: tháng giao</label><input id={`dt${i}`} type="month" required value={d.thang} onChange={(e) => setDot(i, 'thang', e.target.value)} /></div>
              <div><label htmlFor={`ds${i}`}>Số lượng ({dv})</label><input id={`ds${i}`} inputMode="decimal" required value={d.soLuong || ''} onChange={(e) => setDot(i, 'soLuong', so(e.target.value))} /></div>
              {dots.length > 2 && <button type="button" className="phu-btn" onClick={() => doi({ ...v, dotGiao: dots.filter((_, j) => j !== i) })}>Bỏ đợt</button>}
            </div>
          ))}
          <div className="hang" style={{ alignItems: 'center' }}>
            {dots.length < 24 && <button type="button" className="phu-btn" onClick={() => doi({ ...v, dotGiao: [...dots, { thang: '', soLuong: 0 }] })}>Thêm đợt</button>}
            <span className={lech ? 'kyc-canh-bao' : 'phu'}>Tổng các đợt {tong.toLocaleString('vi-VN')} {dv}{lech ? `, phải bằng ${v.soLuong.toLocaleString('vi-VN')} ${dv}` : ''}</span>
          </div>
        </>
      )}
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={!!v.traChamNgay} onChange={(e) => doi({ ...v, traChamNgay: e.target.checked ? 30 : null })} />
        Bán trả chậm (chỉ hợp đồng bán mua đứt; cần hạn mức nợ Giám đốc đã duyệt)
      </label>
      {!!v.traChamNgay && (
        <div className="hang">
          <div><label htmlFor="tcn">Người mua trả sau ngày tàu chạy (ngày)</label><input id="tcn" inputMode="numeric" value={v.traChamNgay} onChange={(e) => doi({ ...v, traChamNgay: Number(e.target.value) || null })} /></div>
        </div>
      )}
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={!!v.duyetMauTruocXuat} onChange={(e) => doi({ ...v, duyetMauTruocXuat: e.target.checked || null })} />
        Người mua phải duyệt mẫu trước xuất (chưa có mẫu đạt thì không xếp tàu)
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={!!g} onChange={(e) => doi({ ...v, giaTruLui: e.target.checked ? { san: 'ICE_LONDON', kyHan: '', chenhLech: 0 } : null })} />
        Giá trừ lùi theo sàn kỳ hạn (chỉ cà phê; tính bằng USD/tấn)
      </label>
      {g && (
        <>
          <div className="hang">
            <div>
              <label htmlFor="san">Sàn</label>
              <select id="san" value={g.san} onChange={(e) => doi({ ...v, giaTruLui: { ...g, san: e.target.value as 'ICE_LONDON' | 'ICE_NY' } })}>
                <option value="ICE_LONDON">ICE London (Robusta)</option>
                <option value="ICE_NY">ICE New York (Arabica)</option>
              </select>
            </div>
            <div><label htmlFor="kh">Kỳ hạn tham chiếu</label><input id="kh" type="month" required value={g.kyHan} onChange={(e) => doi({ ...v, giaTruLui: { ...g, kyHan: e.target.value } })} /></div>
            <div><label htmlFor="cl">Chênh lệch (USD/tấn, âm là trừ)</label><input id="cl" inputMode="decimal" value={g.chenhLech} onChange={(e) => doi({ ...v, giaTruLui: { ...g, chenhLech: Number(e.target.value.replace(',', '.')) || 0 } })} /></div>
          </div>
          <p className="phu" style={{ margin: '4px 0 0' }}>Đơn giá ở trên là giá tạm tính. Giá thật của từng lô là bình quân các lần chốt; phải chốt hết trước khi xếp tàu.</p>
        </>
      )}
    </fieldset>
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
