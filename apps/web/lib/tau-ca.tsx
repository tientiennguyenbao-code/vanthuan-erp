'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { kg } from './lo-hang';
import { ngay } from './nhan';

interface Tau {
  id: string; soDangKy: string; ten: string | null; chuTau: string; quocTich: string; daiM: number | null; nghe: string;
  giayPhep: string | null; giayPhepDen: string | null; coVms: boolean; ghiChu: string | null; huyLuc: string | null; lyDoHuy: string | null;
}
interface Chuyen {
  id: string; ma: string; tauId: string; soDangKy: string; ngayDi: string; ngayCap: string; cang: string; vungKhaiThac: string; loai: string;
  sanLuongKg: number; daThuKg: number; conLaiKg: number; giayKhaiThac: string | null; noiCapGiay: string | null; ngayCapGiay: string | null;
  thieuIuu: string[]; thieuSimp: string[]; huyLuc: string | null; lyDoHuy: string | null; duocHuy: boolean;
}
interface DuLieu { duocGhi: boolean; tau: Tau[]; chuyen: Chuyen[] }

const homNay = () => new Date().toISOString().slice(0, 10);
const rong = (v: string) => (v.trim() ? v.trim() : null);
const so = (v: string) => Number(v.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
const TAU0 = { soDangKy: '', ten: '', chuTau: '', daiM: '', nghe: '', giayPhep: '', giayPhepDen: '', coVms: false };
const CHUYEN0 = { tauId: '', ngayDi: '', ngayCap: homNay(), cang: '', vungKhaiThac: '', loai: '', sanLuongKg: '', giayKhaiThac: '', noiCapGiay: '', ngayCapGiay: '' };

/**
 * Tàu cá và chuyến khai thác của nhà cung cấp thủy sản khai thác. Phiếu thu gom lấy hàng từ chuyến; truy xuất lô xuất
 * kiểm giấy khai thác (EU, chống IUU) và dữ liệu SIMP (Mỹ). Dùng chung cho hồ sơ nguồn cung và cổng nhà cung cấp.
 */
export function TauCa({ duong, goc, doiTacId, moSan = false }: { duong: string; goc: string; doiTacId?: string; moSan?: boolean }) {
  const [d, setD] = useState<DuLieu | null>(null);
  const [loi, setLoi] = useState('');
  const [tb, setTb] = useState('');
  const [t, setT] = useState(TAU0);
  const [c, setC] = useState(CHUYEN0);
  const [huy, setHuy] = useState<{ duong: string; lyDo: string; id: string } | null>(null);

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

  function ghiTau(e: FormEvent) {
    e.preventDefault();
    lam(async () => {
      await api(goc, { body: { doiTacId: doiTacId ?? null, soDangKy: t.soDangKy, ten: rong(t.ten), chuTau: t.chuTau, daiM: t.daiM ? Number(t.daiM.replace(',', '.')) : null, nghe: t.nghe, giayPhep: rong(t.giayPhep), giayPhepDen: t.giayPhepDen || null, coVms: t.coVms } });
      setT(TAU0);
      return `Đã ghi tàu ${t.soDangKy.toUpperCase()}.`;
    });
  }

  function ghiChuyen(e: FormEvent) {
    e.preventDefault();
    lam(async () => {
      const r = await api<{ code: string }>(`${goc}/chuyen`, {
        body: { tauId: c.tauId, ngayDi: c.ngayDi, ngayCap: c.ngayCap, cang: c.cang, vungKhaiThac: c.vungKhaiThac, loai: c.loai, sanLuongKg: so(c.sanLuongKg), giayKhaiThac: rong(c.giayKhaiThac), noiCapGiay: rong(c.noiCapGiay), ngayCapGiay: c.ngayCapGiay || null },
      });
      setC({ ...CHUYEN0, tauId: c.tauId });
      return `Đã ghi chuyến ${r.code}.${c.giayKhaiThac.trim() ? '' : ' Chưa có giấy chứng nhận khai thác: hàng của chuyến chưa đi EU được.'}`;
    });
  }

  if (!d) return loi ? <div className="loi">{loi}</div> : null;
  const tauDung = d.tau.filter((x) => !x.huyLuc);

  return (
    <details className="o" open={moSan || d.tau.length > 0} style={{ marginTop: 16 }}>
      <summary><strong>Tàu cá và chuyến khai thác</strong> <span className="phu">({tauDung.length} tàu, {d.chuyen.filter((x) => !x.huyLuc).length} chuyến)</span></summary>
      <p className="phu">
        Dùng cho thủy sản khai thác tự nhiên. Mỗi chuyến ghi ngày cập cảng, cảng cá, vùng khai thác, sản lượng và số giấy chứng nhận / xác nhận thủy sản khai thác.
        Phiếu thu gom lấy hàng từ chuyến, không vượt sản lượng của chuyến. Hàng đi EU cần giấy khai thác (chống IUU); hàng đi Mỹ cần giấy phép khai thác của tàu (SIMP).
      </p>
      {tb && <div className="dat" role="status">{tb}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}

      <h3>Tàu</h3>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Số đăng ký</th><th>Chủ tàu</th><th>Nghề</th><th>Giấy phép khai thác</th><th>Giám sát hành trình</th><th></th></tr></thead>
          <tbody>
            {d.tau.length === 0 && <tr><td colSpan={6} className="phu">Chưa có tàu nào.</td></tr>}
            {d.tau.map((x) => (
              <tr key={x.id} className={x.huyLuc ? 'huy' : ''}>
                <td style={{ whiteSpace: 'nowrap' }}>{x.soDangKy}<div className="phu">{[x.ten, x.quocTich, x.daiM ? `${x.daiM} m` : null].filter(Boolean).join(' · ')}</div></td>
                <td>{x.chuTau}</td>
                <td>{x.nghe}</td>
                <td>{x.giayPhep ? <>{x.giayPhep}{x.giayPhepDen && <div className={x.giayPhepDen < homNay() ? 'kyc-canh-bao' : 'phu'}>{x.giayPhepDen < homNay() ? 'hết hạn' : 'đến'} {ngay(x.giayPhepDen)}</div>}</> : <span className="canh-bao-nhe">Chưa ghi</span>}</td>
                <td>{x.coVms ? 'Có' : <span className={x.daiM !== null && x.daiM >= 15 ? 'canh-bao-nhe' : 'phu'}>Không</span>}</td>
                <td>{x.huyLuc ? <span className="phu">Đã huỷ: {x.lyDoHuy}</span> : d.duocGhi && huy?.id !== x.id && <button type="button" className="phu-btn nho" onClick={() => setHuy({ id: x.id, duong: `${goc}/${x.id}/huy`, lyDo: '' })}>Huỷ</button>}
                  {huy?.id === x.id && <FormHuy huy={huy} setHuy={setHuy} lam={lam} ten={`tàu ${x.soDangKy}`} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.duocGhi && (
        <form onSubmit={ghiTau} style={{ marginTop: 8 }}>
          <div className="luoi">
            <div><label htmlFor="tc-so">Số đăng ký tàu</label><input id="tc-so" required minLength={4} placeholder="BĐ-96789-TS" value={t.soDangKy} onChange={(e) => setT({ ...t, soDangKy: e.target.value })} /></div>
            <div><label htmlFor="tc-ten">Tên tàu</label><input id="tc-ten" value={t.ten} onChange={(e) => setT({ ...t, ten: e.target.value })} /></div>
            <div><label htmlFor="tc-chu">Chủ tàu</label><input id="tc-chu" required value={t.chuTau} onChange={(e) => setT({ ...t, chuTau: e.target.value })} /></div>
            <div><label htmlFor="tc-dai">Chiều dài (m)</label><input id="tc-dai" inputMode="decimal" value={t.daiM} onChange={(e) => setT({ ...t, daiM: e.target.value })} /></div>
            <div><label htmlFor="tc-nghe">Nghề khai thác</label><input id="tc-nghe" required placeholder="Câu vàng, lưới vây…" value={t.nghe} onChange={(e) => setT({ ...t, nghe: e.target.value })} /></div>
            <div><label htmlFor="tc-gp">Số giấy phép khai thác</label><input id="tc-gp" value={t.giayPhep} onChange={(e) => setT({ ...t, giayPhep: e.target.value })} /></div>
            <div><label htmlFor="tc-gpd">Giấy phép đến</label><input id="tc-gpd" type="date" min={homNay()} value={t.giayPhepDen} onChange={(e) => setT({ ...t, giayPhepDen: e.target.value })} /></div>
            <div><label><input type="checkbox" checked={t.coVms} onChange={(e) => setT({ ...t, coVms: e.target.checked })} /> Có thiết bị giám sát hành trình</label></div>
          </div>
          <button style={{ marginTop: 8 }}>Ghi tàu</button>
        </form>
      )}

      <h3>Chuyến khai thác</h3>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Chuyến</th><th>Tàu</th><th>Cập cảng</th><th>Vùng khai thác, loài</th><th className="so">Sản lượng</th><th>Giấy khai thác</th><th></th></tr></thead>
          <tbody>
            {d.chuyen.length === 0 && <tr><td colSpan={7} className="phu">Chưa có chuyến nào.</td></tr>}
            {d.chuyen.map((x) => {
              const thieu = [...new Set([...x.thieuIuu, ...x.thieuSimp])];
              return (
                <tr key={x.id} className={x.huyLuc ? 'huy' : ''}>
                  <td style={{ whiteSpace: 'nowrap' }}>{x.ma}{!x.huyLuc && thieu.map((m) => <div key={m} className="canh-bao-nhe" style={{ whiteSpace: 'normal' }}>{m}</div>)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{x.soDangKy}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{ngay(x.ngayCap)}<div className="phu">{x.cang}</div><div className="phu">đi {ngay(x.ngayDi)}</div></td>
                  <td>{x.vungKhaiThac}<div className="phu">{x.loai}</div></td>
                  <td className="so">{kg(x.sanLuongKg)}<div className="phu">còn {kg(x.conLaiKg)}</div></td>
                  <td>{x.giayKhaiThac ? <>{x.giayKhaiThac}{x.noiCapGiay && <div className="phu">{x.noiCapGiay}</div>}</> : <span className="canh-bao-nhe">Chưa có</span>}</td>
                  <td>{x.huyLuc ? <span className="phu">Đã huỷ: {x.lyDoHuy}</span> : x.duocHuy && huy?.id !== x.id && <button type="button" className="phu-btn nho" onClick={() => setHuy({ id: x.id, duong: `${goc}/chuyen/${x.id}/huy`, lyDo: '' })}>Huỷ</button>}
                    {huy?.id === x.id && <FormHuy huy={huy} setHuy={setHuy} lam={lam} ten={`chuyến ${x.ma}`} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {d.duocGhi && tauDung.length > 0 && (
        <form onSubmit={ghiChuyen} style={{ marginTop: 8 }}>
          <div className="luoi">
            <div><label htmlFor="ch-tau">Tàu</label><select id="ch-tau" required value={c.tauId} onChange={(e) => setC({ ...c, tauId: e.target.value })}><option value="">Chọn tàu</option>{tauDung.map((x) => <option key={x.id} value={x.id}>{x.soDangKy}{x.ten ? ` · ${x.ten}` : ''}</option>)}</select></div>
            <div><label htmlFor="ch-di">Ngày đi</label><input id="ch-di" type="date" required max={c.ngayCap || homNay()} value={c.ngayDi} onChange={(e) => setC({ ...c, ngayDi: e.target.value })} /></div>
            <div><label htmlFor="ch-cap">Ngày cập cảng</label><input id="ch-cap" type="date" required max={homNay()} value={c.ngayCap} onChange={(e) => setC({ ...c, ngayCap: e.target.value })} /></div>
            <div><label htmlFor="ch-cang">Cảng cá</label><input id="ch-cang" required value={c.cang} onChange={(e) => setC({ ...c, cang: e.target.value })} /></div>
            <div><label htmlFor="ch-vung">Vùng khai thác</label><input id="ch-vung" required placeholder="Vùng khơi, ô lưới hoặc vùng FAO" value={c.vungKhaiThac} onChange={(e) => setC({ ...c, vungKhaiThac: e.target.value })} /></div>
            <div><label htmlFor="ch-loai">Loài</label><input id="ch-loai" required value={c.loai} onChange={(e) => setC({ ...c, loai: e.target.value })} /></div>
            <div><label htmlFor="ch-kg">Sản lượng (kg)</label><input id="ch-kg" inputMode="decimal" required value={c.sanLuongKg} onChange={(e) => setC({ ...c, sanLuongKg: e.target.value })} /></div>
            <div><label htmlFor="ch-giay">Số giấy chứng nhận khai thác</label><input id="ch-giay" value={c.giayKhaiThac} onChange={(e) => setC({ ...c, giayKhaiThac: e.target.value })} /></div>
            <div><label htmlFor="ch-noi">Nơi cấp giấy</label><input id="ch-noi" value={c.noiCapGiay} onChange={(e) => setC({ ...c, noiCapGiay: e.target.value })} /></div>
            <div><label htmlFor="ch-ngay">Ngày cấp giấy</label><input id="ch-ngay" type="date" min={c.ngayCap} max={homNay()} value={c.ngayCapGiay} onChange={(e) => setC({ ...c, ngayCapGiay: e.target.value })} /></div>
          </div>
          <button style={{ marginTop: 8 }}>Ghi chuyến</button>
        </form>
      )}
    </details>
  );
}

function FormHuy({ huy, setHuy, lam, ten }: { huy: { duong: string; lyDo: string; id: string }; setHuy: (h: { duong: string; lyDo: string; id: string } | null) => void; lam: (fn: () => Promise<string>) => void; ten: string }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); lam(async () => { await api(huy.duong, { body: { lyDo: huy.lyDo } }); setHuy(null); return `Đã huỷ ${ten}.`; }); }}>
      <input aria-label="Lý do huỷ" required minLength={3} placeholder="Lý do huỷ" value={huy.lyDo} onChange={(e) => setHuy({ ...huy, lyDo: e.target.value })} />
      <button className="phu-btn nho">Xác nhận</button>
    </form>
  );
}
