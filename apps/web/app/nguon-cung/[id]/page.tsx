'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { NhanKyc } from '@/lib/doi-tac';
import { NGANH } from '@/lib/nhan';
import { banDo, CACH_KIEM_RUNG, docGeojson, ha, HinhThua, HoSoNguonCung, LOAI_THUA, LOAI_VUNG, NGUON_NHAP, NhanRung, taiGeojson, Thua } from '@/lib/nguon-cung';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

const rong = (v: string) => (v.trim() ? v.trim() : null);
const homNay = () => new Date().toISOString().slice(0, 10);

export default function HoSoNhaCungCap() {
  const { id } = useParams<{ id: string }>();
  const toi = useToi();
  const [d, setD] = useState<HoSoNguonCung | null>(null);
  const [loi, setLoi] = useState('');
  const [tb, setTb] = useState('');
  const [chon, setChon] = useState<string | null>(null);
  const [cccd, setCccd] = useState<Record<string, string>>({});
  const [vung, setVung] = useState({ name: '', kind: 'vung_trong', sector: 'ca_phe', officialCode: '', officialCodeIssuer: '', commune: '', district: '', province: '' });
  const [ho, setHo] = useState({ fullName: '', idNumber: '', phone: '', commune: '', district: '', province: '', consentOn: homNay() });
  const [thua, setThua] = useState({ farmerId: '', growingAreaId: '', crop: '', plantedYear: '', lat: '', lon: '', declaredAreaHa: '', ranhGioi: '' });
  const [nhap, setNhap] = useState({ growingAreaId: '', crop: '' });

  const tai = useCallback(() => api<HoSoNguonCung>(`/nguon-cung/${id}`).then(setD), [id]);
  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  async function lam(viec: () => Promise<unknown>, xong: string | ((r: unknown) => string)) {
    setLoi('');
    setTb('');
    try {
      const r = await viec();
      setTb(typeof xong === 'string' ? xong : xong(r));
      await tai();
    } catch (e) {
      setLoi((e as Error).message);
    }
  }
  const canhBaoTb = (r: unknown) => {
    const c = (r as { code?: string; canhBao?: string[] }).canhBao ?? [];
    return `Đã ghi ${(r as { code?: string }).code ?? ''}.${c.length ? ' Cần kiểm tra: ' + c.join('; ') : ''}`;
  };

  if (!toi || !d) return toi ? <KhungTrang toi={toi}>{loi ? <div className="loi">{loi}</div> : null}</KhungTrang> : null;
  const xemCccd = toi.quyen.includes('NGUON_CUNG_XEM_CCCD');
  const hoTheoId = new Map(d.ho.map((h) => [h.id, h]));
  const vungTheoId = new Map(d.vung.map((v) => [v.id, v]));
  const dangDung = d.thua.filter((t) => !t.voidedAt);
  const thuaChon = d.thua.find((t) => t.id === chon) ?? null;
  const hoDung = d.ho.filter((h) => !h.voidedAt);
  const loaiVungChon = vungTheoId.get(thua.growingAreaId)?.kind;

  function hinhHocTuForm(): unknown {
    if (thua.ranhGioi.trim()) {
      const g = JSON.parse(thua.ranhGioi) as { type?: string; geometry?: unknown };
      return g.type === 'Feature' ? g.geometry : g;
    }
    return { type: 'Point', coordinates: [Number(thua.lon), Number(thua.lat)] };
  }

  return (
    <KhungTrang toi={toi}>
      <p><Link href="/nguon-cung">← Nguồn cung</Link></p>
      <h1>{d.nhaCungCap.name}</h1>
      <p className="phu">{d.nhaCungCap.code} · Thẩm định: <NhanKyc s={d.nhaCungCap.kycStatus} /> · <Link href={`/doi-tac/${d.nhaCungCap.id}`}>Hồ sơ đối tác</Link></p>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {tb && <div className="dat">{tb}</div>}
      {d.nhaCungCap.kycStatus !== 'dat' && <div className="loi">Nhà cung cấp chưa được duyệt thẩm định nên chưa thêm được vùng, hộ hay thửa.</div>}

      <h2>Vị trí các thửa</h2>
      <div className="hang" style={{ alignItems: 'start' }}>
        <div style={{ flex: '2 1 360px' }}>
          <HinhThua thua={d.thua} chon={chon} onChon={setChon} />
        </div>
        <div className="o" style={{ flex: '1 1 240px' }}>
          {thuaChon ? (
            <>
              <strong>{thuaChon.code}</strong> <span className="nhan">{LOAI_THUA[thuaChon.kind]}</span>
              <div>Hộ: {hoTheoId.get(thuaChon.farmerId)?.fullName} ({hoTheoId.get(thuaChon.farmerId)?.code})</div>
              <div>Diện tích: {ha(thuaChon.areaHa)}{thuaChon.measuredAreaHa !== null && ' (đo từ ranh giới)'}</div>
              <div>{thuaChon.geometryType === 'diem' ? 'Ghi một điểm' : 'Có ranh giới'}{thuaChon.gpsAccuracyM !== null && ` · sai số GPS ${thuaChon.gpsAccuracyM} m`}</div>
              {thuaChon.crop && <div>Cây trồng / loài nuôi: {thuaChon.crop}{thuaChon.plantedYear && `, trồng năm ${thuaChon.plantedYear}`}</div>}
              {thuaChon.warnings.map((w) => <div key={w} className="canh-bao-nhe">{w}</div>)}
              <p><a href={banDo(thuaChon.tam.lat, thuaChon.tam.lon)} target="_blank" rel="noreferrer">Mở trên bản đồ vệ tinh</a></p>
            </>
          ) : (
            <p className="phu">Bấm vào một thửa trên hình để xem chi tiết.</p>
          )}
          <div style={{ marginTop: 8 }}>
            <button className="phu-btn nho" onClick={() => taiGeojson(`/nguon-cung/${id}/geojson`, `thua-${d.nhaCungCap.code}`).catch((e: Error) => setLoi(e.message))}>Tải GeoJSON (hồ sơ EUDR)</button>
          </div>
        </div>
      </div>

      <h2>Vùng trồng và vùng nuôi</h2>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Mã</th><th>Tên</th><th>Ngành</th><th>Mã số chính thức</th><th>Địa bàn</th><th>Thửa</th><th>Chứng nhận riêng của vùng</th></tr></thead>
          <tbody>
            {d.vung.map((v) => {
              const ts = dangDung.filter((t) => t.growingAreaId === v.id);
              return (
                <tr key={v.id}>
                  <td>{v.code}</td>
                  <td>{v.name}<div className="phu">{LOAI_VUNG[v.kind]}</div></td>
                  <td>{NGANH[v.sector] ?? v.sector}</td>
                  <td>{v.officialCode ?? <span className="phu">Chưa có</span>}{v.officialCodeIssuer && <div className="phu">{v.officialCodeIssuer}</div>}</td>
                  <td>{[v.commune, v.district, v.province].filter(Boolean).join(', ')}</td>
                  <td>{ts.length} · {ha(ts.reduce((s, t) => s + t.areaHa, 0))}</td>
                  <td>{v.chungNhan.length ? v.chungNhan.map((c) => <div key={c.id}>{c.docType} {c.number}{c.expiresOn && <span className="phu"> · hết hạn {c.expiresOn}</span>}</div>) : <span className="phu">—</span>}</td>
                </tr>
              );
            })}
            {d.vung.length === 0 && <tr><td colSpan={7} className="phu">Chưa có vùng nào.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="phu">Chứng nhận chung của nhà cung cấp: {d.chungNhanChung.map((c) => c.docType).join(', ') || '—'}. Thêm chứng nhận cho riêng một vùng ở trang hồ sơ đối tác.</p>
      {d.duocSua && (
        <details className="o">
          <summary>Thêm vùng</summary>
          <form onSubmit={(e) => { e.preventDefault(); lam(() => api(`/nguon-cung/${id}/vung`, { body: { ...vung, officialCode: rong(vung.officialCode), officialCodeIssuer: rong(vung.officialCodeIssuer), commune: rong(vung.commune), district: rong(vung.district) } }), (r) => `Đã tạo vùng ${(r as { code: string }).code}.`); }}>
            <div className="hang">
              <div><label htmlFor="vt">Tên vùng</label><input id="vt" required value={vung.name} onChange={(e) => setVung({ ...vung, name: e.target.value })} /></div>
              <div><label htmlFor="vl">Loại</label><select id="vl" value={vung.kind} onChange={(e) => setVung({ ...vung, kind: e.target.value })}>{Object.entries(LOAI_VUNG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label htmlFor="vn">Ngành</label><select id="vn" value={vung.sector} onChange={(e) => setVung({ ...vung, sector: e.target.value })}>{Object.entries(NGANH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            </div>
            <div className="hang">
              <div><label htmlFor="vm">Mã số vùng trồng / cơ sở nuôi (nếu có)</label><input id="vm" value={vung.officialCode} onChange={(e) => setVung({ ...vung, officialCode: e.target.value })} /></div>
              <div><label htmlFor="vc">Nơi cấp mã</label><input id="vc" value={vung.officialCodeIssuer} onChange={(e) => setVung({ ...vung, officialCodeIssuer: e.target.value })} /></div>
            </div>
            <div className="hang">
              <div><label htmlFor="vx">Xã</label><input id="vx" value={vung.commune} onChange={(e) => setVung({ ...vung, commune: e.target.value })} /></div>
              <div><label htmlFor="vh">Huyện</label><input id="vh" value={vung.district} onChange={(e) => setVung({ ...vung, district: e.target.value })} /></div>
              <div><label htmlFor="vp">Tỉnh</label><input id="vp" required value={vung.province} onChange={(e) => setVung({ ...vung, province: e.target.value })} /></div>
              <button>Tạo vùng</button>
            </div>
          </form>
        </details>
      )}

      <h2>Nông hộ ({hoDung.length})</h2>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Mã</th><th>Chủ hộ</th><th>CCCD</th><th>Địa chỉ</th><th>Ký đồng ý dữ liệu</th><th>Thửa</th><th>Nguồn</th><th></th></tr></thead>
          <tbody>
            {d.ho.map((h) => (
              <tr key={h.id} className={h.voidedAt ? 'huy' : ''}>
                <td>{h.code}</td>
                <td>{h.fullName}{h.phone && <div className="phu">{h.phone}</div>}{h.voidReason && <div className="phu">Đã huỷ: {h.voidReason}</div>}</td>
                <td>
                  {cccd[h.id] ?? h.cccd ?? '—'}
                  {xemCccd && h.coCccd && !cccd[h.id] && (
                    <div><button className="lien-ket" onClick={() => api<{ cccd: string }>(`/nguon-cung/ho/${h.id}/cccd`).then((r) => setCccd({ ...cccd, [h.id]: r.cccd })).catch((e: Error) => setLoi(e.message))}>Xem đủ (ghi nhật ký)</button></div>
                  )}
                </td>
                <td>{[h.commune, h.district, h.province].filter(Boolean).join(', ')}</td>
                <td>{h.consentOn}</td>
                <td>{dangDung.filter((t) => t.farmerId === h.id).length}</td>
                <td className="phu">{NGUON_NHAP[h.source]}</td>
                <td>
                  {d.duocSua && !h.voidedAt && (
                    <button className="nho phu-btn" onClick={() => { const lyDo = window.prompt('Lý do huỷ hộ này?'); if (lyDo) lam(() => api(`/nguon-cung/ho/${h.id}/huy`, { body: { lyDo } }), 'Đã huỷ hộ.'); }}>Huỷ</button>
                  )}
                </td>
              </tr>
            ))}
            {d.ho.length === 0 && <tr><td colSpan={8} className="phu">Chưa có nông hộ.</td></tr>}
          </tbody>
        </table>
      </div>
      {d.duocSua && (
        <details className="o" style={{ marginTop: 12 }}>
          <summary>Thêm nông hộ</summary>
          <form onSubmit={(e) => { e.preventDefault(); lam(() => api(`/nguon-cung/${id}/ho`, { body: { ...ho, idNumber: rong(ho.idNumber), phone: rong(ho.phone), commune: rong(ho.commune), district: rong(ho.district) } }).then((r) => { setHo({ ...ho, fullName: '', idNumber: '', phone: '' }); return r; }), canhBaoTb); }}>
            <div className="hang">
              <div><label htmlFor="hn">Họ tên chủ hộ</label><input id="hn" required value={ho.fullName} onChange={(e) => setHo({ ...ho, fullName: e.target.value })} /></div>
              <div><label htmlFor="hc">Số CCCD</label><input id="hc" inputMode="numeric" value={ho.idNumber} onChange={(e) => setHo({ ...ho, idNumber: e.target.value })} /></div>
              <div><label htmlFor="hd">Điện thoại</label><input id="hd" value={ho.phone} onChange={(e) => setHo({ ...ho, phone: e.target.value })} /></div>
            </div>
            <div className="hang">
              <div><label htmlFor="hx">Xã</label><input id="hx" value={ho.commune} onChange={(e) => setHo({ ...ho, commune: e.target.value })} /></div>
              <div><label htmlFor="hh">Huyện</label><input id="hh" value={ho.district} onChange={(e) => setHo({ ...ho, district: e.target.value })} /></div>
              <div><label htmlFor="ht">Tỉnh</label><input id="ht" required value={ho.province} onChange={(e) => setHo({ ...ho, province: e.target.value })} /></div>
              <div><label htmlFor="hk">Ngày hộ ký đồng ý cho xử lý dữ liệu</label><input id="hk" type="date" required value={ho.consentOn} onChange={(e) => setHo({ ...ho, consentOn: e.target.value })} /></div>
              <button>Thêm hộ</button>
            </div>
          </form>
        </details>
      )}

      <h2>Thửa và ao ({dangDung.length})</h2>
      <BangThua ds={d.thua} hoTheoId={hoTheoId} vungTheoId={vungTheoId} chon={chon} setChon={setChon} suaDuoc={d.duocSua} lam={lam} />
      {d.duocSua && <KiemTraRung ds={dangDung.filter((t) => t.forestStatus === 'chua_kiem')} hoTheoId={hoTheoId} lam={lam} />}
      {d.duocSua && (
        <>
          <details className="o" style={{ marginTop: 12 }}>
            <summary>Thêm thửa bằng tọa độ</summary>
            <p className="phu">Thửa từ 4 ha trở xuống: ghi một điểm ở giữa thửa và diện tích. Thửa trên 4 ha: dán ranh giới dạng GeoJSON. Nhà cung cấp cũng tự lấy tọa độ bằng điện thoại trên cổng.</p>
            <form onSubmit={(e) => {
              e.preventDefault();
              let geometry: unknown;
              try { geometry = hinhHocTuForm(); } catch { setLoi('Ranh giới không phải GeoJSON hợp lệ'); return; }
              lam(() => api(`/nguon-cung/${id}/thua`, { body: {
                farmerId: thua.farmerId, growingAreaId: thua.growingAreaId, kind: loaiVungChon === 'vung_nuoi' ? 'ao' : 'thua', crop: rong(thua.crop),
                plantedYear: thua.plantedYear ? Number(thua.plantedYear) : null, geometry, declaredAreaHa: thua.declaredAreaHa ? Number(thua.declaredAreaHa) : null,
              } }), canhBaoTb);
            }}>
              <div className="hang">
                <div><label htmlFor="th">Hộ</label><select id="th" required value={thua.farmerId} onChange={(e) => setThua({ ...thua, farmerId: e.target.value })}><option value="">Chọn hộ</option>{hoDung.map((h) => <option key={h.id} value={h.id}>{h.code} · {h.fullName}</option>)}</select></div>
                <div><label htmlFor="tv">Vùng</label><select id="tv" required value={thua.growingAreaId} onChange={(e) => setThua({ ...thua, growingAreaId: e.target.value })}><option value="">Chọn vùng</option>{d.vung.filter((v) => v.active).map((v) => <option key={v.id} value={v.id}>{v.code} · {v.name}</option>)}</select></div>
                <div><label htmlFor="tc">Cây trồng / loài nuôi</label><input id="tc" value={thua.crop} onChange={(e) => setThua({ ...thua, crop: e.target.value })} placeholder="Robusta" /></div>
                <div><label htmlFor="ty">Năm trồng</label><input id="ty" inputMode="numeric" value={thua.plantedYear} onChange={(e) => setThua({ ...thua, plantedYear: e.target.value })} /></div>
              </div>
              <div className="hang">
                <div><label htmlFor="tla">Vĩ độ (ví dụ 12.71)</label><input id="tla" inputMode="decimal" value={thua.lat} onChange={(e) => setThua({ ...thua, lat: e.target.value })} /></div>
                <div><label htmlFor="tlo">Kinh độ (ví dụ 108.31)</label><input id="tlo" inputMode="decimal" value={thua.lon} onChange={(e) => setThua({ ...thua, lon: e.target.value })} /></div>
                <div><label htmlFor="tdt">Diện tích khai (ha)</label><input id="tdt" inputMode="decimal" value={thua.declaredAreaHa} onChange={(e) => setThua({ ...thua, declaredAreaHa: e.target.value })} /></div>
              </div>
              <label htmlFor="trg">Hoặc dán ranh giới (GeoJSON Polygon)</label>
              <textarea id="trg" value={thua.ranhGioi} onChange={(e) => setThua({ ...thua, ranhGioi: e.target.value })} placeholder='{"type":"Polygon","coordinates":[[[108.31,12.71],[108.313,12.71],[108.313,12.713],[108.31,12.713]]]}' />
              <button style={{ marginTop: 12 }}>Thêm thửa</button>
            </form>
          </details>
          <details className="o" style={{ marginTop: 12 }}>
            <summary>Nhập nhiều thửa từ tệp GeoJSON</summary>
            <p className="phu">Tệp xuất từ ứng dụng đo đạc. Mỗi thửa cần thuộc tính <code>maHo</code> là mã hộ trong phần mềm (ví dụ {hoDung[0]?.code ?? 'HTX01-H001'}), có thể thêm <code>dienTichHa</code>. Có một thửa sai thì không nhập thửa nào và hiện đủ lý do.</p>
            <div className="hang">
              <div><label htmlFor="nv">Vùng</label><select id="nv" value={nhap.growingAreaId} onChange={(e) => setNhap({ ...nhap, growingAreaId: e.target.value })}><option value="">Chọn vùng</option>{d.vung.filter((v) => v.active).map((v) => <option key={v.id} value={v.id}>{v.code} · {v.name}</option>)}</select></div>
              <div><label htmlFor="nc">Cây trồng / loài nuôi</label><input id="nc" value={nhap.crop} onChange={(e) => setNhap({ ...nhap, crop: e.target.value })} /></div>
              <label className="nut-tep" style={{ flex: '0 0 auto', alignSelf: 'end', padding: '10px 16px' }}>
                Chọn tệp GeoJSON
                <input type="file" accept=".geojson,.json,application/geo+json,application/json" disabled={!nhap.growingAreaId} onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    const features = await docGeojson(f);
                    const kind = vungTheoId.get(nhap.growingAreaId)?.kind === 'vung_nuoi' ? 'ao' : 'thua';
                    await lam(() => api(`/nguon-cung/${id}/nhap-geojson`, { body: { growingAreaId: nhap.growingAreaId, kind, crop: rong(nhap.crop), features } }), (r) => `Đã nhập ${(r as { soThua: number }).soThua} thửa.`);
                  } catch (err) {
                    setLoi((err as Error).message);
                  }
                }} />
              </label>
            </div>
          </details>
        </>
      )}
    </KhungTrang>
  );
}

/** Ghi kết quả kiểm tra rừng cho các thửa chưa kiểm; Trưởng phòng KD hoặc Ban Giám đốc duyệt ở trang Kiểm tra rừng. */
function KiemTraRung({ ds, hoTheoId, lam }: { ds: Thua[]; hoTheoId: Map<string, { code: string; fullName: string }>; lam: (viec: () => Promise<unknown>, xong: string) => Promise<void> }) {
  const [chon, setChon] = useState<string[]>([]);
  const [f, setF] = useState({ method: 'jrc_2020', result: 'khong_rung', evidence: '' });
  if (ds.length === 0) return null;
  return (
    <details className="o" style={{ marginTop: 12 }} open>
      <summary>Ghi kết quả kiểm tra rừng ({ds.length} thửa chưa kiểm)</summary>
      <p className="phu">Đối chiếu tọa độ thửa với bản đồ rừng năm 2020: thửa không được là rừng bị chặt hoặc suy thoái sau 31/12/2020. Kết quả cần người thứ hai duyệt mới có hiệu lực. Đo lại tọa độ thì phải kiểm lại.</p>
      <form onSubmit={(e) => { e.preventDefault(); lam(async () => { await api('/kiem-tra-rung', { body: { plotIds: chon, ...f } }); setChon([]); setF({ ...f, evidence: '' }); }, `Đã ghi kết quả cho ${chon.length} thửa, chờ duyệt.`); }}>
        <div className="o-chon">
          <label><input type="checkbox" checked={chon.length === ds.length} onChange={(e) => setChon(e.target.checked ? ds.map((t) => t.id) : [])} /> Chọn tất cả</label>
          {ds.map((t) => (
            <label key={t.id}>
              <input type="checkbox" checked={chon.includes(t.id)} onChange={(e) => setChon(e.target.checked ? [...chon, t.id] : chon.filter((x) => x !== t.id))} /> {t.code} · {hoTheoId.get(t.farmerId)?.fullName} · {ha(t.areaHa)}
            </label>
          ))}
        </div>
        <div className="hang">
          <div><label htmlFor="rc">Cách kiểm</label><select id="rc" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{Object.entries(CACH_KIEM_RUNG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label htmlFor="rk">Kết quả</label><select id="rk" value={f.result} onChange={(e) => setF({ ...f, result: e.target.value })}><option value="khong_rung">Không có rừng bị chặt sau 31/12/2020</option><option value="co_rung">Có rừng bị chặt hoặc suy thoái sau 31/12/2020</option></select></div>
        </div>
        <label htmlFor="rcc">Căn cứ</label>
        <input id="rcc" required minLength={5} value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} placeholder="VD: Lớp JRC GFC2020 tra ngày 26/11/2026, ảnh chụp lưu ở hồ sơ vùng" />
        <button style={{ marginTop: 12 }} disabled={chon.length === 0}>Ghi kết quả ({chon.length} thửa)</button>
      </form>
    </details>
  );
}

function BangThua({ ds, hoTheoId, vungTheoId, chon, setChon, suaDuoc, lam }: {
  ds: Thua[];
  hoTheoId: Map<string, { code: string; fullName: string }>;
  vungTheoId: Map<string, { code: string }>;
  chon: string | null;
  setChon: (id: string) => void;
  suaDuoc: boolean;
  lam: (viec: () => Promise<unknown>, xong: string) => Promise<void>;
}) {
  return (
    <div className="bang-cuon">
      <table>
        <thead><tr><th>Mã thửa</th><th>Hộ</th><th>Vùng</th><th>Tọa độ</th><th>Diện tích</th><th>Kiểm tra rừng</th><th>Cảnh báo</th><th>Nguồn</th><th></th></tr></thead>
        <tbody>
          {ds.map((t) => (
            <tr key={t.id} className={t.voidedAt ? 'huy' : ''} style={t.id === chon ? { background: 'var(--dat-nen)' } : undefined}>
              <td><button className="lien-ket" onClick={() => setChon(t.id)}>{t.code}</button><div className="phu">{LOAI_THUA[t.kind]}{t.crop && ` · ${t.crop}`}</div>{t.voidReason && <div className="phu">Đã huỷ: {t.voidReason}</div>}</td>
              <td>{hoTheoId.get(t.farmerId)?.fullName}<div className="phu">{hoTheoId.get(t.farmerId)?.code}</div></td>
              <td>{vungTheoId.get(t.growingAreaId)?.code}</td>
              <td>{t.geometryType === 'diem' ? 'Một điểm' : `Ranh giới ${t.geometry.type === 'Polygon' ? t.geometry.coordinates[0].length - 1 : 0} góc`}<div className="phu"><a href={banDo(t.tam.lat, t.tam.lon)} target="_blank" rel="noreferrer">{t.tam.lat.toFixed(5)}, {t.tam.lon.toFixed(5)}</a></div></td>
              <td>{ha(t.areaHa)}{t.declaredAreaHa !== null && t.measuredAreaHa !== null && <div className="phu">khai {ha(t.declaredAreaHa)}</div>}</td>
              <td><NhanRung s={t.forestStatus} /></td>
              <td>{t.warnings.length ? t.warnings.map((w) => <div key={w} className="canh-bao-nhe">{w}</div>) : <span className="phu">—</span>}</td>
              <td className="phu">{NGUON_NHAP[t.source]}</td>
              <td>
                {suaDuoc && !t.voidedAt && (
                  <button className="nho phu-btn" onClick={() => { const lyDo = window.prompt('Lý do huỷ thửa này?'); if (lyDo) lam(() => api(`/nguon-cung/thua/${t.id}/huy`, { body: { lyDo } }), 'Đã huỷ thửa.'); }}>Huỷ</button>
                )}
              </td>
            </tr>
          ))}
          {ds.length === 0 && <tr><td colSpan={9} className="phu">Chưa có thửa nào.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
