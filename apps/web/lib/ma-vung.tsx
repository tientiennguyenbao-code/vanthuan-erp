'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { NGANH, ngay, ngayGio } from './nhan';

export interface LanGuiMa {
  id: string; vungId: string; maVung: string; tenVung: string; nganh: string; nhaCungCap: string;
  ma: string; noiCap: string | null; ngayCap: string | null; hieuLucDen: string | null; conHieuLuc: boolean; phamVi: string | null;
  tep: { ten: string; kichThuoc: number; maBam: string } | null;
  trangThai: string; nguon: string; nguoiGui: string; guiLuc: string; nguoiDuyet: string | null; duyetLuc: string | null; ghiChuDuyet: string | null;
  duocDuyetDong: boolean;
}
interface DuLieu { duocDuyet: boolean; duocGui: boolean; ma: LanGuiMa[] }

export const TRANG_THAI_MA: Record<string, string> = {
  cho_duyet: 'Chờ đối chiếu',
  da_duyet: 'Đã duyệt',
  tu_choi: 'Bị từ chối',
  thay_the: 'Đã thay',
  thu_hoi: 'Đã thu hồi',
};
const MAU: Record<string, string> = { cho_duyet: 'canh-bao-nhe', da_duyet: 'kyc-dat', tu_choi: 'kyc-canh-bao', thu_hoi: 'kyc-canh-bao', thay_the: 'phu' };
const homNay = () => new Date().toISOString().slice(0, 10);
const rong = (v: string) => (v.trim() ? v.trim() : null);

async function guiTep(duong: string, f: File) {
  if (f.size > 25 * 1024 * 1024) throw new Error('Tệp vượt 25 MB');
  const fd = new FormData();
  fd.append('tep', f);
  const res = await fetch(`/api${duong}`, { method: 'POST', body: fd, credentials: 'same-origin' });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(data.message ?? 'Không tải được tệp lên');
}

/**
 * Mã số vùng trồng / mã cơ sở nuôi: gửi mã kèm bản scan giấy chứng nhận, người thứ hai đối chiếu rồi duyệt.
 * Dùng cho hồ sơ nguồn cung (vung có giá trị), cổng nhà cung cấp, và trang các mã chờ duyệt (vung = null, không có mẫu gửi).
 */
export function MaSoVung({ duong, duongGui, duongTep, vung, gon = false }: {
  duong: string;
  duongGui: string;
  duongTep: (id: string) => string;
  vung: { id: string; code: string; name: string }[] | null;
  gon?: boolean;
}) {
  const [d, setD] = useState<DuLieu | null>(null);
  const [loi, setLoi] = useState('');
  const [tb, setTb] = useState('');
  const [f, setF] = useState({ vungId: '', ma: '', noiCap: '', ngayCap: '', hieuLucDen: '', phamVi: '' });
  const [tep, setTep] = useState<File | null>(null);
  const [tuChoi, setTuChoi] = useState<{ id: string; ghiChu: string; thuHoi: boolean } | null>(null);
  const [cu, setCu] = useState(false);

  const tai = useCallback(() => api<DuLieu>(duong).then(setD), [duong]);
  useEffect(() => {
    tai().catch((e: Error) => setLoi(e.message));
  }, [tai]);

  async function lam(fn: () => Promise<string>) {
    setLoi('');
    setTb('');
    try {
      const xong = await fn();
      await tai();
      setTb(xong);
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  function gui(e: FormEvent) {
    e.preventDefault();
    lam(async () => {
      const r = await api<{ id: string }>(duongGui, { body: { vungId: f.vungId, ma: f.ma.trim(), noiCap: rong(f.noiCap), ngayCap: f.ngayCap || null, hieuLucDen: f.hieuLucDen || null, phamVi: rong(f.phamVi) } });
      if (tep) await guiTep(duongTep(r.id), tep);
      setF({ vungId: '', ma: '', noiCap: '', ngayCap: '', hieuLucDen: '', phamVi: '' });
      setTep(null);
      return tep ? `Đã gửi mã ${f.ma.trim()} kèm bản scan. Mã được tính khi truy xuất sau khi người khác đối chiếu và duyệt.` : `Đã gửi mã ${f.ma.trim()}. Còn thiếu bản scan giấy chứng nhận, chưa duyệt được.`;
    });
  }

  async function xemTep(id: string) {
    setLoi('');
    try {
      const r = await api<{ duongDan: string }>(`/ma-vung/${id}/lien-ket`, { method: 'POST' });
      window.open(r.duongDan, '_blank', 'noopener');
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  if (!d) return loi ? <div className="loi">{loi}</div> : <p className="phu">Đang tải mã số vùng…</p>;
  const hien = d.ma.filter((m) => cu || m.trangThai === 'cho_duyet' || m.trangThai === 'da_duyet');
  const an = d.ma.length - hien.length;

  return (
    <section>
      {!gon && (
        <>
          <h2>Mã số vùng trồng / mã cơ sở nuôi</h2>
          <p className="phu">
            Mã chỉ được tính khi truy xuất lô xuất sau khi người thứ hai mở bản scan giấy chứng nhận, so số mã, nơi cấp, hạn hiệu lực và duyệt.
            Hiện chưa có nguồn dữ liệu chính thức để phần mềm tự tra mã với cơ quan cấp.
          </p>
        </>
      )}
      {tb && <div className="dat" role="status">{tb}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}

      {d.duocGui && vung && vung.length > 0 && (
        <form className="o" onSubmit={gui} style={{ marginBottom: 12 }}>
          <strong>Gửi mã để đối chiếu</strong>
          <div className="luoi" style={{ marginTop: 8 }}>
            <div>
              <label htmlFor="mv-vung">Vùng</label>
              <select id="mv-vung" required value={f.vungId} onChange={(e) => setF({ ...f, vungId: e.target.value })}>
                <option value="">Chọn vùng</option>
                {vung.map((v) => <option key={v.id} value={v.id}>{v.code} · {v.name}</option>)}
              </select>
            </div>
            <div><label htmlFor="mv-ma">Mã số trên giấy</label><input id="mv-ma" required minLength={3} value={f.ma} onChange={(e) => setF({ ...f, ma: e.target.value })} placeholder="VN-GL-HT-0031" /></div>
            <div><label htmlFor="mv-noi">Nơi cấp</label><input id="mv-noi" value={f.noiCap} onChange={(e) => setF({ ...f, noiCap: e.target.value })} placeholder="Chi cục Trồng trọt và BVTV" /></div>
            <div><label htmlFor="mv-ngay">Ngày cấp</label><input id="mv-ngay" type="date" max={homNay()} value={f.ngayCap} onChange={(e) => setF({ ...f, ngayCap: e.target.value })} /></div>
            <div><label htmlFor="mv-han">Hiệu lực đến (để trống nếu giấy không ghi)</label><input id="mv-han" type="date" value={f.hieuLucDen} onChange={(e) => setF({ ...f, hieuLucDen: e.target.value })} /></div>
            <div><label htmlFor="mv-pv">Phạm vi trên giấy</label><input id="mv-pv" value={f.phamVi} onChange={(e) => setF({ ...f, phamVi: e.target.value })} placeholder="Xuất khẩu sang Trung Quốc" /></div>
            <div><label htmlFor="mv-tep">Bản scan giấy chứng nhận (PDF, JPG, PNG)</label><input id="mv-tep" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setTep(e.target.files?.[0] ?? null)} /></div>
          </div>
          <button style={{ marginTop: 12 }}>Gửi mã</button>
        </form>
      )}

      <div className="bang-cuon">
        <table>
          <thead><tr><th>Vùng</th><th>Mã số</th><th>Hiệu lực</th><th>Bản scan</th><th>Trạng thái</th><th>Người gửi</th><th></th></tr></thead>
          <tbody>
            {hien.length === 0 && <tr><td colSpan={7} className="phu">{vung === null ? 'Không có mã nào chờ đối chiếu.' : 'Chưa có mã nào được gửi.'}</td></tr>}
            {hien.map((m) => (
              <tr key={m.id} className={m.trangThai === 'thay_the' || m.trangThai === 'tu_choi' || m.trangThai === 'thu_hoi' ? 'huy' : ''}>
                <td style={{ minWidth: 160 }}>{m.maVung} · {m.tenVung}<div className="phu">{vung === null ? `${m.nhaCungCap} · ` : ''}{NGANH[m.nganh] ?? m.nganh}</div></td>
                <td><strong>{m.ma}</strong>{m.noiCap && <div className="phu">{m.noiCap}</div>}{m.phamVi && <div className="phu">{m.phamVi}</div>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {m.ngayCap && <div className="phu">cấp {ngay(m.ngayCap)}</div>}
                  {m.hieuLucDen ? <span className={m.conHieuLuc ? '' : 'kyc-canh-bao'}>{m.conHieuLuc ? 'đến' : 'hết hạn'} {ngay(m.hieuLucDen)}</span> : <span className="phu">không ghi hạn</span>}
                </td>
                <td>
                  {m.tep ? (
                    <button type="button" className="lien-ket" onClick={() => xemTep(m.id)} title={`Mã băm SHA-256: ${m.tep.maBam}`}>{m.tep.ten}</button>
                  ) : m.trangThai === 'cho_duyet' ? (
                    <span className="canh-bao-nhe">Chưa có</span>
                  ) : (
                    <span className="phu">—</span>
                  )}
                  {m.trangThai === 'cho_duyet' && d.duocGui && (
                    <div><label style={{ cursor: 'pointer', color: 'var(--chinh)', textDecoration: 'underline', fontWeight: 400 }}>{m.tep ? 'Thay bản scan' : 'Tải bản scan'}
                      <input type="file" accept="application/pdf,image/jpeg,image/png" style={{ display: 'none' }} onChange={(e) => { const x = e.target.files?.[0]; if (x) lam(async () => { await guiTep(duongTep(m.id), x); return `Đã tải bản scan cho mã ${m.ma}.`; }); }} />
                    </label></div>
                  )}
                </td>
                <td>
                  <span className={MAU[m.trangThai]}>{TRANG_THAI_MA[m.trangThai] ?? m.trangThai}</span>
                  {m.nguoiDuyet && <div className="phu">{m.nguoiDuyet} · {ngayGio(m.duyetLuc!)}</div>}
                  {m.ghiChuDuyet && <div className="phu">{m.ghiChuDuyet}</div>}
                </td>
                <td>{m.nguoiGui}<div className="phu">{m.nguon === 'cong_ncc' ? 'Nhà cung cấp gửi' : 'Nhân viên gửi'} · {ngayGio(m.guiLuc)}</div></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {m.duocDuyetDong && tuChoi?.id !== m.id && (
                    <>
                      <button type="button" className="nho" disabled={!m.tep || !m.conHieuLuc} title={!m.tep ? 'Chưa có bản scan để đối chiếu' : !m.conHieuLuc ? 'Giấy đã hết hạn' : 'Đã mở bản scan và so khớp mã, nơi cấp, hạn'}
                        onClick={() => lam(async () => { await api(`/ma-vung/${m.id}/duyet`, { body: { dongY: true } }); return `Đã duyệt mã ${m.ma} cho vùng ${m.maVung}.`; })}>Khớp, duyệt</button>{' '}
                      <button type="button" className="phu-btn nho" onClick={() => setTuChoi({ id: m.id, ghiChu: '', thuHoi: false })}>Từ chối</button>
                    </>
                  )}
                  {d.duocDuyet && m.trangThai === 'da_duyet' && tuChoi?.id !== m.id && (
                    <button type="button" className="phu-btn nho" onClick={() => setTuChoi({ id: m.id, ghiChu: '', thuHoi: true })}>Thu hồi</button>
                  )}
                  {m.trangThai === 'cho_duyet' && !m.duocDuyetDong && d.duocDuyet && <span className="phu">Bạn gửi mã này, nhờ người khác duyệt</span>}
                  {tuChoi?.id === m.id && (
                    <form onSubmit={(e) => { e.preventDefault(); lam(async () => {
                      if (tuChoi.thuHoi) await api(`/ma-vung/${m.id}/thu-hoi`, { body: { lyDo: tuChoi.ghiChu } });
                      else await api(`/ma-vung/${m.id}/duyet`, { body: { dongY: false, ghiChu: tuChoi.ghiChu } });
                      setTuChoi(null);
                      return tuChoi.thuHoi ? `Đã thu hồi mã ${m.ma}; vùng ${m.maVung} trở về chưa có mã.` : `Đã từ chối mã ${m.ma}.`;
                    }); }}>
                      <input aria-label="Lý do" required minLength={3} placeholder={tuChoi.thuHoi ? 'Lý do thu hồi' : 'Điểm không khớp'} value={tuChoi.ghiChu} onChange={(e) => setTuChoi({ ...tuChoi, ghiChu: e.target.value })} />
                      <button className="phu-btn nho">Xác nhận</button> <button type="button" className="lien-ket" onClick={() => setTuChoi(null)}>Thôi</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {an > 0 && <button type="button" className="lien-ket" onClick={() => setCu(true)} style={{ marginTop: 6 }}>Xem {an} lần gửi cũ (đã thay, bị từ chối, đã thu hồi)</button>}
    </section>
  );
}
