'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { ngay, ngayGio } from './nhan';

export const TRANG_THAI_CHUNG_TU: Record<string, string> = {
  thieu: 'Chưa có',
  dang_xin: 'Đang xin',
  nhap: 'Có bản nháp, chờ duyệt',
  da_duyet: 'Đã duyệt',
  da_gui: 'Đã gửi',
  khong_ap_dung: 'Không áp dụng',
};
export const YEU_CAU: Record<string, string> = { bb: 'Bắt buộc', nm: 'Người mua yêu cầu' };
export const GIAI_DOAN: Record<string, string> = { truoc_xep_tau: 'Trước xếp tàu', sau_xep_tau: 'Sau xếp tàu' };
export const BEN_LAM: Record<string, string> = { van_thuan: 'Vạn Thuận', nha_cung_cap: 'Nhà cung cấp', nguoi_nhap: 'Người nhập khẩu', ben_xuat_khau: 'Bên đứng tên xuất khẩu' };
export const PHAM_VI: Record<string, string> = { lo: 'Một bộ cho cả lô', nguoi_xuat_khau: 'Theo người xuất khẩu', nha_cung_cap: 'Theo từng nhà cung cấp' };
export const NGANH: Record<string, string> = { ca_phe: 'Cà phê', gia_vi: 'Gia vị', thuy_san: 'Thủy sản' };

interface ChungTu {
  id: string;
  code: string;
  name: string;
  requirement: string;
  stage: string;
  party: string;
  issuer: string | null;
  supplierName: string | null;
  status: string;
  number: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  note: string | null;
  obsolete: boolean;
  updatedByName: string | null;
  approvedByName: string | null;
  chuaChac: boolean;
  quaHanRaSoat: boolean;
  legalBasis: string | null;
  tep: { id: string; phienBan: number; ten: string; kichThuoc: number; maBam: string; nguoiNop: string; luc: string }[];
  quyen: { taiTep: boolean; capNhat: boolean; duyet: boolean; traLai: boolean; daGui: boolean; khongApDung: boolean };
}
interface Checklist {
  tongBatBuoc: number;
  daDuBatBuoc: number;
  thieuTruocXepTau: string[];
  daMoChan: boolean;
  moChan: { lyDo: string; nguoi: string; luc: string; daDung: boolean }[];
  chungTu: ChungTu[];
  quyen: { dongBo: boolean; moChan: boolean };
}

const trong = { trangThai: 'dang_xin', so: '', ngayCap: '', noiCap: '', ngayHetHan: '', ghiChu: '' };

/** Checklist chứng từ của một lô xuất: cập nhật, duyệt 4 mắt, đánh dấu đã gửi, Giám đốc mở chặn. */
export function ChecklistChungTu({ loId, onDoi }: { loId: string; onDoi: () => void }) {
  const [ct, setCt] = useState<Checklist | null>(null);
  const [loi, setLoi] = useState('');
  const [thongBao, setThongBao] = useState('');
  const [dangSua, setDangSua] = useState<ChungTu | null>(null);
  const [f, setF] = useState(trong);
  const [lyDoMo, setLyDoMo] = useState('');
  const [xemCu, setXemCu] = useState(false);

  const tai = useCallback(async () => setCt(await api<Checklist>(`/lo-xuat/${loId}/chung-tu`)), [loId]);
  useEffect(() => {
    tai().catch((e: Error) => setLoi(e.message));
  }, [tai]);

  async function lam(fn: () => Promise<unknown>, xong: string) {
    setLoi('');
    setThongBao('');
    try {
      await fn();
      setDangSua(null);
      setLyDoMo('');
      await tai();
      onDoi();
      setThongBao(xong);
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  function moSua(d: ChungTu) {
    setDangSua(d);
    setF({
      trangThai: d.status === 'da_duyet' ? 'nhap' : d.status,
      so: d.number ?? '',
      ngayCap: d.issuedOn ?? '',
      noiCap: d.issuer ?? '',
      ngayHetHan: d.expiresOn ?? '',
      ghiChu: d.note ?? '',
    });
  }

  function luu(e: FormEvent) {
    e.preventDefault();
    const d = dangSua!;
    const body = { trangThai: f.trangThai, so: f.so || null, ngayCap: f.ngayCap || null, noiCap: f.noiCap || null, ngayHetHan: f.ngayHetHan || null, ghiChu: f.ghiChu || null };
    lam(() => api(`/chung-tu/${d.id}`, { method: 'PUT', body }), d.status === 'da_duyet' ? 'Đã sửa; chứng từ cần được duyệt lại.' : 'Đã cập nhật chứng từ.');
  }

  async function taiLen(d: ChungTu, f: File | undefined) {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) {
      setLoi('Tệp vượt 25 MB');
      return;
    }
    await lam(async () => {
      const fd = new FormData();
      fd.append('tep', f);
      const res = await fetch(`/api/chung-tu/${d.id}/tep`, { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? 'Không tải được tệp lên');
    }, `Đã tải tệp lên: ${d.name}.${d.status === 'da_duyet' ? ' Chứng từ cần được duyệt lại.' : ''}`);
  }

  async function moTep(tepId: string) {
    setLoi('');
    try {
      const r = await api<{ duongDan: string }>(`/tep/${tepId}/lien-ket`, { method: 'POST' });
      window.open(r.duongDan, '_blank', 'noopener');
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  const hoiLyDo = (cau: string, fn: (l: string) => Promise<unknown>, xong: string) => {
    const l = window.prompt(cau);
    if (l) lam(() => fn(l), xong);
  };

  if (!ct) return loi ? <div className="loi">{loi}</div> : <p className="phu">Đang tải chứng từ…</p>;
  const dangDung = ct.chungTu.filter((d) => !d.obsolete);
  const cu = ct.chungTu.filter((d) => d.obsolete);

  const dong = (d: ChungTu) => (
    <tr key={d.id} className={d.obsolete ? 'huy' : ''}>
      <td>
        {d.name}
        {d.supplierName && <div className="phu">{d.supplierName}</div>}
        {d.chuaChac && <div className="kyc-canh-bao" style={{ fontWeight: 400, fontSize: 13 }}>Căn cứ chưa chắc chắn, cần xác minh</div>}
        {d.quaHanRaSoat && <div className="kyc-canh-bao" style={{ fontWeight: 400, fontSize: 13 }}>Quy tắc quá 12 tháng chưa rà soát</div>}
      </td>
      <td>
        <span className="nhan">{YEU_CAU[d.requirement]}</span>
        <div className="phu">{BEN_LAM[d.party] ?? d.party}</div>
      </td>
      <td>
        <span className={d.status === 'da_duyet' || d.status === 'da_gui' ? 'kyc-dat' : d.status === 'khong_ap_dung' ? 'phu' : d.requirement === 'bb' ? 'kyc-canh-bao' : ''}>{TRANG_THAI_CHUNG_TU[d.status]}</span>
        {d.approvedByName && (d.status === 'da_duyet' || d.status === 'da_gui') && <div className="phu">duyệt: {d.approvedByName}</div>}
        {d.note && <div className="phu">{d.note}</div>}
      </td>
      <td>
        {d.number ?? '—'}
        {d.expiresOn && <div className="phu">hết hạn {ngay(d.expiresOn)}</div>}
        {d.tep[0] && (
          <div>
            <button type="button" className="lien-ket" onClick={() => moTep(d.tep[0].id)} title={`Mã băm SHA-256: ${d.tep[0].maBam}`}>
              {d.tep[0].ten}
            </button>
            <div className="phu">bản {d.tep[0].phienBan} · {d.tep[0].nguoiNop}</div>
            {d.tep.length > 1 && (
              <details>
                <summary className="phu">Bản cũ</summary>
                {d.tep.slice(1).map((t) => (
                  <div key={t.id}><button type="button" className="lien-ket" onClick={() => moTep(t.id)}>bản {t.phienBan}: {t.ten}</button> <span className="phu">{ngayGio(t.luc)}</span></div>
                ))}
              </details>
            )}
          </div>
        )}
      </td>
      <td>
        <div className="hang" style={{ gap: 6 }}>
          {d.quyen.capNhat && <button className="phu-btn nho" onClick={() => moSua(d)}>Cập nhật</button>}
          {d.quyen.taiTep && (
            <label className="nut-tep nho">
              {d.tep.length ? 'Nộp bản mới' : 'Tải tệp'}
              <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => { taiLen(d, e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          )}
          {d.quyen.duyet && <button className="nho" onClick={() => lam(() => api(`/chung-tu/${d.id}/duyet`, { method: 'POST' }), `Đã duyệt: ${d.name}.`)}>Duyệt</button>}
          {d.quyen.traLai && <button className="phu-btn nho" onClick={() => hoiLyDo('Lý do trả lại', (l) => api(`/chung-tu/${d.id}/tra-lai`, { body: { lyDo: l } }), 'Đã trả lại chứng từ.')}>Trả lại</button>}
          {d.quyen.daGui && <button className="nho" onClick={() => lam(() => api(`/chung-tu/${d.id}/da-gui`, { method: 'POST' }), `Đã ghi gửi: ${d.name}.`)}>Đã gửi</button>}
          {d.quyen.khongApDung && (
            <button className="phu-btn nho" onClick={() => hoiLyDo('Vì sao chứng từ này không áp dụng cho lô?', (l) => api(`/chung-tu/${d.id}/khong-ap-dung`, { body: { lyDo: l } }), 'Đã đánh dấu không áp dụng.')}>
              Không áp dụng
            </button>
          )}
        </div>
      </td>
    </tr>
  );

  const bang = (ds: ChungTu[]) => (
    <div className="bang-cuon">
      <table>
        <thead><tr><th>Chứng từ</th><th>Yêu cầu, bên làm</th><th>Trạng thái</th><th>Số, hạn, tệp</th><th></th></tr></thead>
        <tbody>{ds.length ? ds.map(dong) : <tr><td colSpan={5} className="phu">Không có.</td></tr>}</tbody>
      </table>
    </div>
  );

  return (
    <div>
      <p>
        Chứng từ bắt buộc đã đủ: <strong>{ct.daDuBatBuoc}/{ct.tongBatBuoc}</strong>
        {ct.quyen.dongBo && (
          <button className="phu-btn nho" style={{ marginLeft: 12 }} onClick={() => lam(() => api(`/lo-xuat/${loId}/chung-tu/dong-bo`, { method: 'POST' }), 'Đã cập nhật checklist theo quy tắc mới nhất.')}>
            Cập nhật theo quy tắc mới
          </button>
        )}
      </p>
      {thongBao && <div className="dat" role="status">{thongBao}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}

      {ct.thieuTruocXepTau.length > 0 && (
        <div className="o" style={{ marginTop: 12 }}>
          <strong>Chưa đủ để xếp tàu</strong>
          <ul style={{ margin: '8px 0 0' }}>{ct.thieuTruocXepTau.map((t) => <li key={t} className="kyc-canh-bao">{t}</li>)}</ul>
          {ct.daMoChan && <p className="kyc-dat">Giám đốc đã mở chặn cho lần xếp tàu này.</p>}
          {ct.quyen.moChan && (
            <form onSubmit={(e) => { e.preventDefault(); lam(() => api(`/lo-xuat/${loId}/mo-chan`, { body: { lyDo: lyDoMo } }), 'Đã mở chặn; lô được xếp tàu một lần dù còn thiếu chứng từ.'); }}>
              <label htmlFor="mochan">Giám đốc mở chặn (ghi lý do, lưu vào nhật ký)</label>
              <div className="hang">
                <input id="mochan" required minLength={3} value={lyDoMo} onChange={(e) => setLyDoMo(e.target.value)} placeholder="VD: người mua đồng ý nhận bản sao, bổ sung bản chính sau" />
                <button className="phu-btn">Mở chặn</button>
              </div>
            </form>
          )}
        </div>
      )}
      {ct.moChan.length > 0 && (
        <p className="phu">
          {ct.moChan.map((m) => `Mở chặn bởi ${m.nguoi} lúc ${ngayGio(m.luc)}: ${m.lyDo}${m.daDung ? ' (đã dùng)' : ''}`).join(' · ')}
        </p>
      )}

      {dangSua && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={luu}>
          <strong>Cập nhật: {dangSua.name}{dangSua.supplierName ? ` (${dangSua.supplierName})` : ''}</strong>
          {dangSua.status === 'da_duyet' && <p className="kyc-canh-bao">Chứng từ đã duyệt; sửa xong phải được duyệt lại.</p>}
          {dangSua.legalBasis && <p className="phu">Căn cứ: {dangSua.legalBasis}</p>}
          <div className="hang">
            <div>
              <label htmlFor="cttt">Tình trạng</label>
              <select id="cttt" value={f.trangThai} onChange={(e) => setF({ ...f, trangThai: e.target.value })}>
                <option value="thieu">Chưa có</option>
                <option value="dang_xin">Đang xin</option>
                <option value="nhap">Đã có bản nháp hoặc bản chính (gửi duyệt)</option>
              </select>
            </div>
            <div><label htmlFor="ctso">Số chứng từ</label><input id="ctso" required={f.trangThai === 'nhap'} value={f.so} onChange={(e) => setF({ ...f, so: e.target.value })} /></div>
            <div><label htmlFor="ctnc">Nơi cấp</label><input id="ctnc" value={f.noiCap} onChange={(e) => setF({ ...f, noiCap: e.target.value })} /></div>
          </div>
          <div className="hang">
            <div><label htmlFor="ctng">Ngày cấp</label><input id="ctng" type="date" value={f.ngayCap} onChange={(e) => setF({ ...f, ngayCap: e.target.value })} /></div>
            <div><label htmlFor="cthh">Ngày hết hạn</label><input id="cthh" type="date" value={f.ngayHetHan} onChange={(e) => setF({ ...f, ngayHetHan: e.target.value })} /></div>
            <div><label htmlFor="ctgc">Ghi chú</label><input id="ctgc" value={f.ghiChu} onChange={(e) => setF({ ...f, ghiChu: e.target.value })} /></div>
          </div>
          <div className="hang" style={{ marginTop: 12 }}>
            <button>Lưu</button>
            <button type="button" className="phu-btn" onClick={() => setDangSua(null)}>Thôi</button>
          </div>
        </form>
      )}

      <h3>Trước xếp tàu</h3>
      {bang(dangDung.filter((d) => d.stage === 'truoc_xep_tau'))}
      <h3>Sau xếp tàu</h3>
      {bang(dangDung.filter((d) => d.stage === 'sau_xep_tau'))}
      {cu.length > 0 && (
        <details style={{ marginTop: 12 }} open={xemCu} onToggle={(e) => setXemCu((e.target as HTMLDetailsElement).open)}>
          <summary>{cu.length} dòng không còn áp dụng (sau khi đổi phân bổ)</summary>
          {bang(cu)}
        </details>
      )}
    </div>
  );
}
