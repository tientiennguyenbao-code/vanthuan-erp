'use client';

import { TRANG_THAI_BAO_GIA } from './nhan';

export interface BaoGia {
  id: string;
  code: string;
  kind: 'mua' | 'ban';
  partnerId: string;
  partnerName: string;
  commodityId: string;
  commodityName?: string;
  sourceQuoteId: string | null;
  status: string;
  version: number;
  quantity: number;
  unit: 'kg' | 'tan';
  unitPrice: number;
  currency: string;
  fxPerUsd: number | null;
  incoterms: string;
  portFrom: string | null;
  portTo: string | null;
  validUntil: string;
  hetHieuLuc: boolean;
  spec: string | null;
  certifications: string | null;
  deliveryTime: string | null;
  paymentTerms: string | null;
  feeRatePct: number | null;
  note: string | null;
  rejectReason: string | null;
  giaTri: number;
  ownerName?: string;
  updatedAt: string;
}

/** Dữ liệu ô nhập báo giá, gửi thẳng lên máy chủ. */
export interface NhapBaoGia {
  doiTacId: string;
  matHangId: string;
  baoGiaNguonId: string | null;
  soLuong: number;
  donVi: 'kg' | 'tan';
  donGia: number;
  tienTe: string;
  tyGiaUsd: number | null;
  incoterms: string;
  cangDi: string | null;
  cangDen: string | null;
  hieuLucDen: string;
  quyCach: string | null;
  chungNhan: string | null;
  thoiGianGiao: string | null;
  thanhToan: string | null;
  tyLePhiPhanTram: number | null;
  ghiChu: string | null;
}

export function tuBaoGia(q: BaoGia): NhapBaoGia {
  return {
    doiTacId: q.partnerId,
    matHangId: q.commodityId,
    baoGiaNguonId: q.sourceQuoteId,
    soLuong: q.quantity,
    donVi: q.unit,
    donGia: q.unitPrice,
    tienTe: q.currency,
    tyGiaUsd: q.fxPerUsd,
    incoterms: q.incoterms,
    cangDi: q.portFrom,
    cangDen: q.portTo,
    hieuLucDen: q.validUntil,
    quyCach: q.spec,
    chungNhan: q.certifications,
    thoiGianGiao: q.deliveryTime,
    thanhToan: q.paymentTerms,
    tyLePhiPhanTram: q.feeRatePct,
    ghiChu: q.note,
  };
}

const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
const so = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));

export interface LuaChon {
  doiTac: { id: string; name: string; code: string }[];
  matHang: { id: string; name: string }[];
  nguon: { id: string; code: string; partnerName: string }[];
}

/** Ô nhập dùng chung cho báo giá mua và bán. */
export function ONhapBaoGia({ loai, v, doi, chon }: { loai: 'mua' | 'ban'; v: NhapBaoGia; doi: (v: NhapBaoGia) => void; chon: LuaChon }) {
  const set = <K extends keyof NhapBaoGia>(k: K, val: NhapBaoGia[K]) => doi({ ...v, [k]: val });
  return (
    <>
      <div className="hang">
        <div style={{ flexBasis: 300 }}>
          <label htmlFor="dt">{loai === 'mua' ? 'Nhà cung cấp' : 'Người mua'}</label>
          <select id="dt" required value={v.doiTacId} onChange={(e) => set('doiTacId', e.target.value)}>
            <option value="">Chọn…</option>
            {chon.doiTac.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="mh">Mặt hàng</label>
          <select id="mh" required value={v.matHangId} onChange={(e) => set('matHangId', e.target.value)}>
            <option value="">Chọn…</option>
            {chon.matHang.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        {loai === 'ban' && (
          <div style={{ flexBasis: 280 }}>
            <label htmlFor="ng">Báo giá mua làm nguồn</label>
            <select id="ng" value={v.baoGiaNguonId ?? ''} onChange={(e) => set('baoGiaNguonId', e.target.value || null)}>
              <option value="">Chưa chọn</option>
              {chon.nguon.map((q) => <option key={q.id} value={q.id}>{q.code} · {q.partnerName}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="hang">
        <div><label htmlFor="sl">Số lượng</label><input id="sl" inputMode="decimal" required value={v.soLuong || ''} onChange={(e) => set('soLuong', so(e.target.value))} /></div>
        <div>
          <label htmlFor="dv">Đơn vị</label>
          <select id="dv" value={v.donVi} onChange={(e) => set('donVi', e.target.value as NhapBaoGia['donVi'])}><option value="tan">tấn</option><option value="kg">kg</option></select>
        </div>
        <div><label htmlFor="dg">Đơn giá (theo đơn vị)</label><input id="dg" inputMode="decimal" required value={v.donGia || ''} onChange={(e) => set('donGia', so(e.target.value))} /></div>
        <div>
          <label htmlFor="tt">Tiền tệ</label>
          <select id="tt" value={v.tienTe} onChange={(e) => set('tienTe', e.target.value)}>{['USD', 'VND', 'EUR', 'CNY'].map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        {v.tienTe !== 'USD' && <div><label htmlFor="tg">Tỷ giá: {v.tienTe} cho 1 USD</label><input id="tg" inputMode="decimal" value={v.tyGiaUsd ?? ''} onChange={(e) => set('tyGiaUsd', e.target.value ? so(e.target.value) : null)} /></div>}
      </div>
      <div className="hang">
        <div>
          <label htmlFor="ic">Incoterms</label>
          <select id="ic" value={v.incoterms} onChange={(e) => set('incoterms', e.target.value)}>{INCOTERMS.map((i) => <option key={i}>{i}</option>)}</select>
        </div>
        <div><label htmlFor="cd">Cảng đi</label><input id="cd" value={v.cangDi ?? ''} onChange={(e) => set('cangDi', e.target.value || null)} /></div>
        <div><label htmlFor="cden">Cảng đến</label><input id="cden" value={v.cangDen ?? ''} onChange={(e) => set('cangDen', e.target.value || null)} /></div>
        <div><label htmlFor="hl">Hiệu lực đến hết ngày</label><input id="hl" type="date" required value={v.hieuLucDen} onChange={(e) => set('hieuLucDen', e.target.value)} /></div>
        {loai === 'ban' && <div><label htmlFor="phi">Phí trọn gói (%)</label><input id="phi" inputMode="decimal" value={v.tyLePhiPhanTram ?? ''} onChange={(e) => set('tyLePhiPhanTram', e.target.value ? so(e.target.value) : null)} /></div>}
      </div>
      <div className="hang">
        <div style={{ flexBasis: 300 }}><label htmlFor="tgg">Thời gian giao</label><input id="tgg" value={v.thoiGianGiao ?? ''} onChange={(e) => set('thoiGianGiao', e.target.value || null)} /></div>
        <div style={{ flexBasis: 300 }}><label htmlFor="ttoan">Thanh toán</label><input id="ttoan" value={v.thanhToan ?? ''} onChange={(e) => set('thanhToan', e.target.value || null)} /></div>
        {loai === 'mua' && <div style={{ flexBasis: 240 }}><label htmlFor="cn">Chứng nhận</label><input id="cn" value={v.chungNhan ?? ''} onChange={(e) => set('chungNhan', e.target.value || null)} placeholder="VietGAP, HACCP…" /></div>}
      </div>
      <label htmlFor="qc">Quy cách</label>
      <textarea id="qc" rows={2} value={v.quyCach ?? ''} onChange={(e) => set('quyCach', e.target.value || null)} />
    </>
  );
}

export function NhanBaoGia({ s, hetHan }: { s: string; hetHan?: boolean }) {
  if (hetHan && (s === 'nhap' || s === 'da_gui')) return <span className="kyc-canh-bao">Hết hiệu lực</span>;
  const cls = s === 'chap_nhan' ? 'kyc-dat' : s === 'tu_choi' || s === 'huy' ? 'kyc-canh-bao' : '';
  return <span className={cls}>{TRANG_THAI_BAO_GIA[s] ?? s}</span>;
}
