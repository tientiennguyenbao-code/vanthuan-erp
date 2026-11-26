'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { GIAI_DOAN, TRANG_THAI_CHUNG_TU, YEU_CAU } from './chung-tu';
import { CacBuoc, kg, LOAI_GIAO_DICH, THI_TRUONG, TRANG_THAI_LO_XUAT } from './lo-hang';
import { ngay, ngayGio } from './nhan';

interface Tep { id: string; phienBan: number; ten: string; maBam: string; luc: string }
interface ChungTu {
  id: string;
  name: string;
  requirement: string;
  stage: string;
  issuer: string | null;
  status: string;
  number: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  note: string | null;
  chungCaLo: boolean;
  tep: Tep[];
  coTheCapNhat: boolean;
}
interface Lo {
  code: string;
  dealType: string;
  status: string;
  market: string;
  commodityName: string;
  etd: string | null;
  eta: string | null;
  blNumber: string | null;
  shippedOn: string | null;
  tauChuyen: string | null;
  cutoffSi: string | null;
  cutoffHang: string | null;
  ngayDenCutoff: number | null;
  buyerName: string | null;
  khoiLuongCuaToiKg: number;
  laNhaCungCapChinh: boolean;
  chungTu: ChungTu[];
  chungTuNhaCungCapKhac: { name: string; supplierName: string; requirement: string; stage: string; status: string }[];
}

const xong = (s: string) => s === 'da_duyet' || s === 'da_gui' || s === 'khong_ap_dung';

/** Trang lô trên cổng nhà cung cấp: thẻ chứng từ dễ dùng trên điện thoại (chụp ảnh và nộp ngay). */
export function ChungTuCong({ loId }: { loId: string }) {
  const [lo, setLo] = useState<Lo | null>(null);
  const [loi, setLoi] = useState('');
  const [tb, setTb] = useState('');
  const [sua, setSua] = useState<string | null>(null);
  const [f, setF] = useState({ trangThai: 'dang_xin', so: '', ngayCap: '', noiCap: '', ngayHetHan: '', ghiChu: '' });

  const tai = useCallback(async () => setLo(await api<Lo>(`/cong/lo/${loId}`)), [loId]);
  useEffect(() => {
    tai().catch((e: Error) => setLoi(e.message));
  }, [tai]);

  async function lam(fn: () => Promise<unknown>, thongBao: string) {
    setLoi('');
    setTb('');
    try {
      await fn();
      setSua(null);
      await tai();
      setTb(thongBao);
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  function moSua(d: ChungTu) {
    setSua(d.id);
    setF({ trangThai: d.status === 'nhap' || d.status === 'da_duyet' ? 'nhap' : d.status === 'thieu' ? 'dang_xin' : d.status, so: d.number ?? '', ngayCap: d.issuedOn ?? '', noiCap: d.issuer ?? '', ngayHetHan: d.expiresOn ?? '', ghiChu: '' });
  }

  function luu(e: FormEvent, d: ChungTu) {
    e.preventDefault();
    const body = { trangThai: f.trangThai, so: f.so || null, ngayCap: f.ngayCap || null, noiCap: f.noiCap || null, ngayHetHan: f.ngayHetHan || null, ghiChu: f.ghiChu || null };
    lam(() => api(`/chung-tu/${d.id}`, { method: 'PUT', body }), `Đã cập nhật: ${d.name}.`);
  }

  function nop(d: ChungTu, file: File | undefined) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return setLoi('Tệp vượt 25 MB');
    lam(async () => {
      const fd = new FormData();
      fd.append('tep', file);
      const res = await fetch(`/api/chung-tu/${d.id}/tep`, { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? 'Không nộp được tệp');
    }, `Đã nộp tệp: ${d.name}. Vạn Thuận sẽ kiểm tra và duyệt.`);
  }

  async function xem(tepId: string) {
    try {
      const r = await api<{ duongDan: string }>(`/tep/${tepId}/lien-ket`, { method: 'POST' });
      window.open(r.duongDan, '_blank', 'noopener');
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  if (!lo) return loi ? <div className="loi">{loi}</div> : <p className="phu">Đang tải…</p>;
  const bb = lo.chungTu.filter((d) => d.requirement === 'bb');

  const the = (d: ChungTu) => (
    <div key={d.id} className="the-ct">
      <div>
        <strong>{d.name}</strong> <span className="nhan">{YEU_CAU[d.requirement]}</span>
        {d.chungCaLo && <span className="nhan">Chung cả lô</span>}
      </div>
      <div className={xong(d.status) ? 'kyc-dat' : d.status === 'nhap' ? '' : d.requirement === 'bb' ? 'kyc-canh-bao' : 'phu'}>
        {d.status === 'nhap' ? 'Đã nộp, chờ Vạn Thuận duyệt' : TRANG_THAI_CHUNG_TU[d.status]}
        {d.number && <span className="phu"> · số {d.number}</span>}
        {d.expiresOn && <span className="phu"> · hết hạn {ngay(d.expiresOn)}</span>}
      </div>
      {d.note && <div className={d.note.startsWith('Trả lại') ? 'loi' : 'phu'} style={{ marginTop: 6 }}>{d.note}</div>}
      {d.issuer && <div className="phu">Nơi cấp: {d.issuer}</div>}
      {d.tep.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {d.tep.map((t, i) => (
            <div key={t.id} className={i ? 'phu' : ''}>
              <button type="button" className="lien-ket" onClick={() => xem(t.id)}>{t.ten}</button> <span className="phu">bản {t.phienBan} · {ngayGio(t.luc)}</span>
            </div>
          ))}
        </div>
      )}
      {d.coTheCapNhat && sua !== d.id && (
        <div className="hang" style={{ gap: 8 }}>
          <label className="nut-tep">
            {d.tep.length ? 'Nộp bản mới' : 'Chụp hoặc chọn tệp'}
            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => { nop(d, e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <button className="phu-btn nho" onClick={() => moSua(d)}>Ghi số, ngày cấp</button>
        </div>
      )}
      {sua === d.id && (
        <form onSubmit={(e) => luu(e, d)} style={{ marginTop: 8 }}>
          <label htmlFor={`tt-${d.id}`}>Tình trạng</label>
          <select id={`tt-${d.id}`} value={f.trangThai} onChange={(e) => setF({ ...f, trangThai: e.target.value })}>
            <option value="dang_xin">Đang xin cấp</option>
            <option value="nhap">Đã có (gửi Vạn Thuận duyệt)</option>
          </select>
          <div className="hang">
            <div><label htmlFor={`so-${d.id}`}>Số chứng từ</label><input id={`so-${d.id}`} required={f.trangThai === 'nhap'} value={f.so} onChange={(e) => setF({ ...f, so: e.target.value })} /></div>
            <div><label htmlFor={`nc-${d.id}`}>Ngày cấp</label><input id={`nc-${d.id}`} type="date" value={f.ngayCap} onChange={(e) => setF({ ...f, ngayCap: e.target.value })} /></div>
            <div><label htmlFor={`hh-${d.id}`}>Ngày hết hạn</label><input id={`hh-${d.id}`} type="date" value={f.ngayHetHan} onChange={(e) => setF({ ...f, ngayHetHan: e.target.value })} /></div>
          </div>
          <label htmlFor={`noi-${d.id}`}>Nơi cấp</label>
          <input id={`noi-${d.id}`} value={f.noiCap} onChange={(e) => setF({ ...f, noiCap: e.target.value })} />
          <label htmlFor={`gc-${d.id}`}>Ghi chú cho Vạn Thuận</label>
          <input id={`gc-${d.id}`} value={f.ghiChu} onChange={(e) => setF({ ...f, ghiChu: e.target.value })} />
          <div className="hang">
            <button>Lưu</button>
            <button type="button" className="phu-btn" onClick={() => setSua(null)}>Thôi</button>
          </div>
        </form>
      )}
    </div>
  );

  return (
    <div>
      <h1>{lo.code} <span style={{ fontSize: 16 }}>{TRANG_THAI_LO_XUAT[lo.status]}</span></h1>
      <CacBuoc hienTai={lo.status} />
      <div className="o">
        <div>{lo.commodityName} · {THI_TRUONG[lo.market]} · {LOAI_GIAO_DICH[lo.dealType]}</div>
        {lo.buyerName && <div>Người mua: {lo.buyerName}</div>}
        <div>Hàng của quý công ty trong lô: <strong>{kg(lo.khoiLuongCuaToiKg)}</strong></div>
        <div className="phu">Tàu dự kiến chạy {ngay(lo.etd)}{lo.tauChuyen ? ` · ${lo.tauChuyen}` : ''}</div>
        {(lo.cutoffSi || lo.cutoffHang) && <div className={lo.ngayDenCutoff !== null && lo.ngayDenCutoff <= 3 ? 'kyc-canh-bao' : ''}>Cut-off chứng từ {ngayGio(lo.cutoffSi)} · hàng {ngayGio(lo.cutoffHang)}</div>}
        {lo.blNumber && <div>Vận đơn {lo.blNumber}, tàu chạy {ngay(lo.shippedOn)}</div>}
        {lo.laNhaCungCapChinh && <div className="kyc-dat">Quý công ty là nhà cung cấp chính, đứng tên người gửi hàng trên vận đơn.</div>}
      </div>
      {tb && <div className="dat" role="status">{tb}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}

      <h2>Chứng từ của quý công ty</h2>
      <p>Bắt buộc đã đủ: <strong>{bb.filter((d) => xong(d.status)).length}/{bb.length}</strong>. Nhận PDF hoặc ảnh chụp (JPG, PNG), tối đa 25 MB.</p>
      {(['truoc_xep_tau', 'sau_xep_tau'] as const).map((g) => {
        const ds = lo.chungTu.filter((d) => d.stage === g);
        return ds.length ? (
          <div key={g}>
            <h3>{GIAI_DOAN[g]}</h3>
            {ds.map(the)}
          </div>
        ) : null;
      })}

      {lo.chungTuNhaCungCapKhac.length > 0 && (
        <>
          <h2>Chứng từ của các nhà cung cấp cùng lô</h2>
          <p className="phu">Để quý công ty lập bộ chứng từ đứng tên người gửi hàng. Chỉ hiện tình trạng.</p>
          {[...new Set(lo.chungTuNhaCungCapKhac.map((d) => d.supplierName))].map((ten) => (
            <div key={ten} className="the-ct">
              <strong>{ten}</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {lo.chungTuNhaCungCapKhac.filter((d) => d.supplierName === ten).map((d) => (
                  <li key={d.name}>
                    {d.name}
                    {d.requirement !== 'bb' && <span className="phu"> ({YEU_CAU[d.requirement].toLowerCase()})</span>}: <span className={xong(d.status) ? 'kyc-dat' : d.requirement === 'bb' ? 'kyc-canh-bao' : 'phu'}>{TRANG_THAI_CHUNG_TU[d.status]}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
