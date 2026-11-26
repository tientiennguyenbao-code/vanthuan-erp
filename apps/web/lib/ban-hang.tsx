'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
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

export const SAN_KY_HAN: Record<string, string> = { ICE_LONDON: 'ICE London (Robusta, USD/tấn)', ICE_NY: 'ICE New York (Arabica, US cent/lb)' };
const tan = (kgv: number) => `${(kgv / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 3 })} tấn`;
const usd = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} USD/tấn`);
const thangVn = (t: string) => `${t.slice(5)}/${t.slice(0, 4)}`;

interface LanChot {
  id: string;
  fixedOn: string;
  quantityKg: number;
  futuresPrice: number;
  differential: number;
  finalPrice: number;
  requestedBy: string;
  note: string | null;
  createdByName: string;
  voidedAt: string | null;
  voidReason: string | null;
}
interface BanHangLoData {
  dotGiao: { dot: number; tongSoDot: number } | null;
  canMauTruocXuat: boolean;
  mauTruocXuat: { code: string; status: string }[];
  giaTruLui: {
    san: string;
    kyHan: string;
    chenhLech: number;
    canChotKg: number;
    daChotKg: number;
    toiDaKg: number;
    conLaiKg: number;
    giaBinhQuan: number | null;
    canhBao: boolean;
    lanChot: LanChot[];
  } | null;
  thieuBanHang: string[];
  quyen: { chotGia: boolean };
}

/** Điều kiện bán hàng của lô xuất: đợt giao, mẫu trước xuất, chốt giá trừ lùi. */
export function BanHangLo({ loId, onDoi }: { loId: string; onDoi?: () => void }) {
  const [d, setD] = useState<BanHangLoData | null>(null);
  const [loi, setLoi] = useState('');
  const [tb, setTb] = useState('');
  const [f, setF] = useState({ ngayChot: new Date().toISOString().slice(0, 10), soKg: '', giaSan: '', nguoiYeuCau: 'nguoi_mua', ghiChu: '' });
  const [huy, setHuy] = useState<{ id: string; lyDo: string } | null>(null);
  const tai = useCallback(() => api<BanHangLoData>(`/lo-xuat/${loId}/ban-hang`).then(setD), [loId]);
  useEffect(() => {
    tai().catch((e: Error) => setLoi(e.message));
  }, [tai]);

  async function lam(fn: () => Promise<unknown>, xong: string) {
    setLoi('');
    setTb('');
    try {
      await fn();
      setTb(xong);
      await tai();
      onDoi?.();
    } catch (e) {
      setLoi((e as Error).message);
    }
  }
  function chot(e: FormEvent) {
    e.preventDefault();
    const so = (v: string) => Number(v.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
    lam(
      () => api(`/lo-xuat/${loId}/ban-hang/chot-gia`, { body: { ngayChot: f.ngayChot, soKg: so(f.soKg), giaSan: Number(f.giaSan.replace(',', '.')), nguoiYeuCau: f.nguoiYeuCau, ghiChu: f.ghiChu || null } }),
      'Đã ghi lần chốt giá.',
    ).then(() => setF((x) => ({ ...x, soKg: '', giaSan: '', ghiChu: '' })));
  }

  if (!d) return loi ? <div className="loi" role="alert">{loi}</div> : null;
  if (!d.dotGiao && !d.canMauTruocXuat && !d.giaTruLui) return null;
  const g = d.giaTruLui;
  const ny = g?.san === 'ICE_NY';
  return (
    <div>
      <h2>Bán hàng: đợt giao, mẫu, chốt giá</h2>
      {tb && <div className="dat" role="status">{tb}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}
      <div className="luoi">
        {d.dotGiao && (
          <div className="o">
            <strong>Đợt giao</strong>
            <div>Đợt {d.dotGiao.dot} trong {d.dotGiao.tongSoDot} đợt của hợp đồng</div>
          </div>
        )}
        {d.canMauTruocXuat && (
          <div className="o">
            <strong>Mẫu trước xuất</strong>
            <div className="phu">Hợp đồng yêu cầu người mua duyệt mẫu trước khi xếp tàu.</div>
            {d.mauTruocXuat.length === 0 ? (
              <div className="kyc-canh-bao">Chưa gửi mẫu nào.</div>
            ) : (
              d.mauTruocXuat.map((m) => <div key={m.code}>{m.code}: <NhanMau s={m.status} /></div>)
            )}
            <Link href="/ban-hang/mau">Gửi mẫu, ghi kết quả</Link>
          </div>
        )}
        {g && (
          <div className="o">
            <strong>Giá trừ lùi</strong>
            <div>{SAN_KY_HAN[g.san]}, kỳ hạn {thangVn(g.kyHan)}</div>
            <div>Chênh lệch {g.chenhLech > 0 ? '+' : ''}{g.chenhLech.toLocaleString('vi-VN')} USD/tấn</div>
            <div>Đã chốt <strong>{tan(g.daChotKg)}</strong> trên {tan(g.canChotKg)} · còn {tan(g.conLaiKg)}</div>
            <div>Giá bình quân đã chốt: <strong>{usd(g.giaBinhQuan)}</strong></div>
            {g.canhBao && <div className="kyc-canh-bao">Còn dưới 10 ngày đến ngày tàu chạy mà chưa chốt hết giá.</div>}
          </div>
        )}
      </div>
      {d.thieuBanHang.length > 0 && (
        <ul style={{ margin: '8px 0 0' }}>{d.thieuBanHang.map((t) => <li key={t} className="kyc-canh-bao">{t} (chặn xếp tàu)</li>)}</ul>
      )}

      {g && (
        <>
          <div className="bang-cuon" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>Ngày chốt</th><th className="so">Khối lượng</th><th className="so">Giá sàn</th><th className="so">Chênh lệch</th><th className="so">Giá chốt</th><th>Ai yêu cầu</th><th>Người ghi</th><th></th></tr></thead>
              <tbody>
                {g.lanChot.length === 0 && <tr><td colSpan={8} className="phu">Chưa chốt lần nào.</td></tr>}
                {g.lanChot.map((c) => (
                  <tr key={c.id} style={c.voidedAt ? { opacity: 0.55 } : undefined}>
                    <td>{ngay(c.fixedOn)}{c.voidedAt && <div className="kyc-canh-bao">Đã huỷ: {c.voidReason}</div>}{c.note && <div className="phu">{c.note}</div>}</td>
                    <td className="so">{tan(c.quantityKg)}</td>
                    <td className="so">{c.futuresPrice.toLocaleString('vi-VN')}{ny ? ' ¢/lb' : ''}</td>
                    <td className="so">{c.differential.toLocaleString('vi-VN')}</td>
                    <td className="so"><strong>{c.finalPrice.toLocaleString('vi-VN')}</strong></td>
                    <td>{c.requestedBy === 'nguoi_mua' ? 'Người mua' : 'Vạn Thuận'}</td>
                    <td>{c.createdByName}</td>
                    <td>{d.quyen.chotGia && !c.voidedAt && <button className="phu-btn" onClick={() => setHuy({ id: c.id, lyDo: '' })}>Huỷ</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {huy && (
            <form className="o" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); lam(() => api(`/lo-xuat/${loId}/ban-hang/chot-gia/${huy.id}/huy`, { body: { lyDo: huy.lyDo } }), 'Đã huỷ lần chốt.').then(() => setHuy(null)); }}>
              <label htmlFor="ldhuy">Lý do huỷ lần chốt</label>
              <input id="ldhuy" required minLength={3} value={huy.lyDo} onChange={(e) => setHuy({ ...huy, lyDo: e.target.value })} />
              <div className="hang"><button>Xác nhận huỷ</button><button type="button" className="phu-btn" onClick={() => setHuy(null)}>Thôi</button></div>
            </form>
          )}
          {d.quyen.chotGia && g.conLaiKg > 0 && (
            <form className="o" style={{ marginTop: 12 }} onSubmit={chot}>
              <strong>Ghi một lần chốt giá</strong>
              <p className="phu" style={{ margin: '4px 0 0' }}>Giá chốt = giá sàn {ny ? '(quy từ cent/lb ra USD/tấn)' : ''} + chênh lệch trong hợp đồng. Mỗi lần chốt được ghi vào sổ cái của hợp đồng.</p>
              <div className="hang">
                <div><label htmlFor="nc">Ngày chốt</label><input id="nc" type="date" required value={f.ngayChot} onChange={(e) => setF({ ...f, ngayChot: e.target.value })} /></div>
                <div><label htmlFor="kgc">Khối lượng (kg)</label><input id="kgc" inputMode="decimal" required value={f.soKg} placeholder={String(g.conLaiKg)} onChange={(e) => setF({ ...f, soKg: e.target.value })} /></div>
                <div><label htmlFor="gs">Giá sàn {ny ? '(US cent/lb)' : '(USD/tấn)'}</label><input id="gs" inputMode="decimal" required value={f.giaSan} onChange={(e) => setF({ ...f, giaSan: e.target.value })} /></div>
                <div>
                  <label htmlFor="ai">Ai yêu cầu chốt</label>
                  <select id="ai" value={f.nguoiYeuCau} onChange={(e) => setF({ ...f, nguoiYeuCau: e.target.value })}><option value="nguoi_mua">Người mua</option><option value="van_thuan">Vạn Thuận</option></select>
                </div>
              </div>
              <label htmlFor="gcc">Ghi chú</label>
              <input id="gcc" value={f.ghiChu} onChange={(e) => setF({ ...f, ghiChu: e.target.value })} placeholder="VD: email người mua lúc 21:05" />
              <button style={{ marginTop: 12 }}>Ghi lần chốt</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

interface ThucHien {
  dot: { dot: number; thang: string | null; keHoachKg: number; lo: { id: string; code: string; status: string } | null; phanBoKg: number; daGiaoKg: number; daChotKg: number; giaBinhQuan: number | null }[];
  tongKg: number;
  daGiaoKg: number;
  conLaiKg: number;
  toiThieuKg: number;
  toiDaKg: number;
  vuotDungSai: boolean;
  hoanThanh: boolean;
  nhieuDot: boolean;
  giaTruLui: { san: string; kyHan: string; chenhLech: number } | null;
  canMauTruocXuat: boolean;
}

/** Tiến độ giao theo đợt của hợp đồng bán. */
export function ThucHienHopDong({ hopDongId, nhanTrangThaiLo }: { hopDongId: string; nhanTrangThaiLo: Record<string, string> }) {
  const [d, setD] = useState<ThucHien | null>(null);
  useEffect(() => {
    api<{ thucHien: ThucHien | null }>(`/hop-dong/${hopDongId}/thuc-hien`).then((r) => setD(r.thucHien)).catch(() => setD(null));
  }, [hopDongId]);
  if (!d) return null;
  return (
    <>
      <h2>Thực hiện hợp đồng</h2>
      <p>
        Đã giao <strong>{tan(d.daGiaoKg)}</strong> trên {tan(d.tongKg)} · còn {tan(d.conLaiKg)}
        <span className="phu"> (được giao từ {tan(d.toiThieuKg)} đến {tan(d.toiDaKg)})</span>
        {d.hoanThanh && <span className="kyc-dat"> · Đã giao xong</span>}
        {d.vuotDungSai && <span className="kyc-canh-bao"> · Giao vượt dung sai</span>}
      </p>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Đợt</th><th>Tháng</th><th className="so">Kế hoạch</th><th>Lô xuất</th><th className="so">Đã phân bổ</th><th className="so">Đã giao</th>{d.giaTruLui && <><th className="so">Đã chốt giá</th><th className="so">Giá bình quân</th></>}</tr></thead>
          <tbody>
            {d.dot.map((r) => (
              <tr key={r.dot}>
                <td>{r.dot}</td>
                <td>{r.thang ? thangVn(r.thang) : '—'}</td>
                <td className="so">{tan(r.keHoachKg)}</td>
                <td>{r.lo ? <><Link href={`/lo-hang/${r.lo.id}`}>{r.lo.code}</Link> <span className="phu">{nhanTrangThaiLo[r.lo.status] ?? r.lo.status}</span></> : <span className="phu">Chưa lập</span>}</td>
                <td className="so">{tan(r.phanBoKg)}</td>
                <td className="so">{tan(r.daGiaoKg)}</td>
                {d.giaTruLui && <><td className="so">{tan(r.daChotKg)}</td><td className="so">{usd(r.giaBinhQuan)}</td></>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
