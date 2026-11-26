'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api } from './api';
import { ngay } from './nhan';

export const NGUON_HOI_HANG: Record<string, string> = { email: 'Email', hoi_cho: 'Hội chợ', gioi_thieu: 'Được giới thiệu', website: 'Trang web', cong: 'Cổng người mua', khac: 'Khác' };
export const TRANG_THAI_HOI_HANG: Record<string, string> = { moi: 'Mới', dang_bao_gia: 'Đang báo giá', thang: 'Thắng', thua: 'Thua', huy: 'Đã huỷ' };
export const LY_DO_THUA: Record<string, string> = { gia: 'Giá', chat_luong: 'Chất lượng', thoi_gian_giao: 'Thời gian giao', chung_nhan: 'Thiếu chứng nhận', khong_phan_hoi: 'Người mua không phản hồi', khac: 'Khác' };
export const LOAI_MAU: Record<string, string> = { chao_hang: 'Chào hàng', truoc_xuat: 'Trước xuất', doi_chung: 'Đối chứng' };
export const TRANG_THAI_MAU: Record<string, string> = { chuan_bi: 'Đang chuẩn bị', da_gui: 'Đã gửi', dat: 'Đạt', khong_dat: 'Không đạt', luu: 'Đang lưu', huy: 'Đã huỷ' };

export interface HoiHang {
  id: string;
  code: string;
  partnerId: string;
  partnerName: string;
  partnerCountry: string;
  commodityId: string;
  commodityName: string;
  source: string;
  receivedOn: string;
  quantity: number;
  unit: 'kg' | 'tan';
  spec: string | null;
  certifications: string | null;
  deliveryMonth: string | null;
  incoterms: string | null;
  portTo: string | null;
  targetPrice: number | null;
  currency: string | null;
  note: string | null;
  status: string;
  lostReason: string | null;
  closeNote: string | null;
  ownerName: string;
  hanBaoGia: string;
  quaHan: boolean;
}

export interface TongHop {
  tong: number;
  theoTrangThai: Record<string, number>;
  tyLeThang: number | null;
  lyDoThua: Record<string, number>;
  quaHan: number;
}

export interface Mau {
  id: string;
  code: string;
  kind: string;
  status: string;
  partnerName: string;
  commodityName: string;
  sector: string;
  inquiryId: string | null;
  inquiryCode: string | null;
  exportLotId: string | null;
  exportLotCode: string | null;
  purchaseLotCode: string | null;
  weightG: number | null;
  description: string | null;
  courier: string | null;
  trackingNo: string | null;
  sentOn: string | null;
  retainUntil: string | null;
  resultOn: string | null;
  cupScore: number | null;
  resultNote: string | null;
  cancelReason: string | null;
  quyen: { gui: boolean; ketQua: boolean; huy: boolean };
}

export function NhanHoiHang({ s, quaHan }: { s: string; quaHan?: boolean }) {
  if (quaHan) return <span className="kyc-canh-bao">Quá hạn báo giá</span>;
  const cls = s === 'thang' ? 'kyc-dat' : s === 'thua' || s === 'huy' ? 'kyc-canh-bao' : s === 'dang_bao_gia' ? 'canh-bao-nhe' : '';
  return <span className={cls}>{TRANG_THAI_HOI_HANG[s] ?? s}</span>;
}

export function NhanMau({ s }: { s: string }) {
  const cls = s === 'dat' ? 'kyc-dat' : s === 'khong_dat' ? 'kyc-canh-bao' : s === 'huy' ? 'phu' : '';
  return <span className={cls}>{TRANG_THAI_MAU[s] ?? s}</span>;
}

/** Bảng mẫu hàng có các nút gửi, ghi kết quả, huỷ. Dùng ở trang mẫu và trang phiếu hỏi hàng. */
export function BangMau({ ds, taiLai, coCot = true }: { ds: Mau[]; taiLai: () => void; coCot?: boolean }) {
  const [mo, setMo] = useState<{ id: string; viec: 'gui' | 'ketQua' | 'huy' } | null>(null);
  const [f, setF] = useState({ hang: 'DHL', soVanDon: '', ngay: new Date().toISOString().slice(0, 10), dat: 'true', diem: '', nhanXet: '', lyDo: '' });
  const [loi, setLoi] = useState('');
  async function gui(e: FormEvent) {
    e.preventDefault();
    if (!mo) return;
    setLoi('');
    try {
      if (mo.viec === 'gui') await api(`/mau/${mo.id}/gui`, { body: { hangChuyenPhat: f.hang, soVanDon: f.soVanDon || null, ngayGui: f.ngay } });
      if (mo.viec === 'ketQua') await api(`/mau/${mo.id}/ket-qua`, { body: { dat: f.dat === 'true', ngay: f.ngay, diemThuNem: f.diem ? Number(f.diem.replace(',', '.')) : null, nhanXet: f.nhanXet || null } });
      if (mo.viec === 'huy') await api(`/mau/${mo.id}/huy`, { body: { lyDo: f.lyDo } });
      setMo(null);
      taiLai();
    } catch (err) {
      setLoi((err as Error).message);
    }
  }
  const dangMo = mo && ds.find((m) => m.id === mo.id);
  return (
    <>
      <div className="bang-cuon" style={{ marginTop: 12 }}>
        <table>
          <thead><tr><th>Số mẫu</th><th>Loại</th>{coCot && <th>Người mua</th>}{coCot && <th>Mặt hàng</th>}<th>Gắn với</th><th>Gửi</th><th>Kết quả</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {ds.map((m) => (
              <tr key={m.id}>
                <td>{m.code}{m.weightG && <div className="phu">{m.weightG} g</div>}</td>
                <td>{LOAI_MAU[m.kind]}</td>
                {coCot && <td>{m.partnerName}</td>}
                {coCot && <td>{m.commodityName}</td>}
                <td>
                  {m.inquiryCode && <div><Link href={`/ban-hang/hoi-hang/${m.inquiryId}`}>{m.inquiryCode}</Link></div>}
                  {m.exportLotCode && <div><Link href={`/lo-hang/${m.exportLotId}`}>{m.exportLotCode}</Link></div>}
                  {m.purchaseLotCode && <div className="phu">lô mua {m.purchaseLotCode}</div>}
                  {!m.inquiryCode && !m.exportLotCode && !m.purchaseLotCode && '—'}
                </td>
                <td>{m.sentOn ? <>{ngay(m.sentOn)}<div className="phu">{m.courier}{m.trackingNo ? ` · ${m.trackingNo}` : ''}</div></> : m.kind === 'doi_chung' ? <span className="phu">lưu đến {ngay(m.retainUntil)}</span> : '—'}</td>
                <td>{m.resultOn ? <>{ngay(m.resultOn)}{m.cupScore != null && <div>Thử nếm: <strong>{m.cupScore}</strong></div>}{m.resultNote && <div className="phu">{m.resultNote}</div>}</> : '—'}</td>
                <td><NhanMau s={m.status} />{m.cancelReason && <div className="phu">{m.cancelReason}</div>}</td>
                <td>
                  {m.quyen.gui && <button className="phu-btn nho" onClick={() => setMo({ id: m.id, viec: 'gui' })}>Ghi đã gửi</button>}{' '}
                  {m.quyen.ketQua && <button className="phu-btn nho" onClick={() => setMo({ id: m.id, viec: 'ketQua' })}>Ghi kết quả</button>}{' '}
                  {m.quyen.huy && <button className="phu-btn nho" onClick={() => setMo({ id: m.id, viec: 'huy' })}>Huỷ</button>}
                </td>
              </tr>
            ))}
            {ds.length === 0 && <tr><td colSpan={coCot ? 9 : 7} className="phu">Chưa có mẫu nào.</td></tr>}
          </tbody>
        </table>
      </div>
      {mo && dangMo && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={gui}>
          <strong>{mo.viec === 'gui' ? 'Ghi đã gửi' : mo.viec === 'ketQua' ? 'Ghi kết quả của người mua' : 'Huỷ'} mẫu {dangMo.code}</strong>
          {mo.viec === 'gui' && (
            <div className="hang">
              <div><label htmlFor="hcp">Hãng chuyển phát</label><input id="hcp" required value={f.hang} onChange={(e) => setF({ ...f, hang: e.target.value })} /></div>
              <div><label htmlFor="svd">Số vận đơn</label><input id="svd" value={f.soVanDon} onChange={(e) => setF({ ...f, soVanDon: e.target.value })} /></div>
              <div><label htmlFor="ngg">Ngày gửi</label><input id="ngg" type="date" required value={f.ngay} onChange={(e) => setF({ ...f, ngay: e.target.value })} /></div>
            </div>
          )}
          {mo.viec === 'ketQua' && (
            <>
              <div className="hang">
                <div><label htmlFor="kq">Kết quả</label><select id="kq" value={f.dat} onChange={(e) => setF({ ...f, dat: e.target.value })}><option value="true">Đạt</option><option value="false">Không đạt</option></select></div>
                <div><label htmlFor="nkq">Ngày có kết quả</label><input id="nkq" type="date" required value={f.ngay} onChange={(e) => setF({ ...f, ngay: e.target.value })} /></div>
                {dangMo.sector === 'ca_phe' && <div><label htmlFor="dtn">Điểm thử nếm (thang 100)</label><input id="dtn" inputMode="decimal" value={f.diem} onChange={(e) => setF({ ...f, diem: e.target.value })} /></div>}
              </div>
              <label htmlFor="nx">Nhận xét của người mua{f.dat === 'false' ? ' (bắt buộc khi không đạt)' : ''}</label>
              <textarea id="nx" rows={2} value={f.nhanXet} onChange={(e) => setF({ ...f, nhanXet: e.target.value })} />
            </>
          )}
          {mo.viec === 'huy' && (<><label htmlFor="ldh">Lý do huỷ</label><input id="ldh" required value={f.lyDo} onChange={(e) => setF({ ...f, lyDo: e.target.value })} /></>)}
          {loi && <div className="loi" role="alert">{loi}</div>}
          <div className="hang" style={{ marginTop: 12 }}><button>Lưu</button><button type="button" className="phu-btn" onClick={() => setMo(null)}>Đóng</button></div>
        </form>
      )}
    </>
  );
}
