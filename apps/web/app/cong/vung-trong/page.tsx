'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { banDo, dienTichHa, ha, HinhThua, HoSoNguonCung, layViTri, LonLat, LOAI_THUA, taiGeojson, themHangCho, useHangCho, ViTri } from '@/lib/nguon-cung';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

const homNay = () => new Date().toISOString().slice(0, 10);
const rong = (v: string) => (v.trim() ? v.trim() : null);

type Cach = 'diem' | 'ranh_gioi';

/**
 * Cổng nhà cung cấp, dùng trên điện thoại ngoài vườn: thêm nông hộ, đánh dấu thửa bằng GPS.
 * Thửa nhỏ (≤ 4 ha): đứng giữa thửa bấm một lần. Thửa lớn: đi quanh ranh giới, đến mỗi góc bấm "Ghi góc này".
 * Mất sóng thì thửa được giữ trên máy và tự gửi khi có mạng.
 */
export default function VungTrongCuaToi() {
  const toi = useToi();
  const [d, setD] = useState<HoSoNguonCung | null>(null);
  const [loi, setLoi] = useState('');
  const [tb, setTb] = useState('');
  const [dangLay, setDangLay] = useState(false);
  const [moThemHo, setMoThemHo] = useState(false);
  const [ho, setHo] = useState({ fullName: '', idNumber: '', phone: '', commune: '', district: '', province: '', consentOn: homNay() });
  const [f, setF] = useState({ farmerId: '', growingAreaId: '', crop: '', declaredAreaHa: '' });
  const [cach, setCach] = useState<Cach>('diem');
  const [diem, setDiem] = useState<ViTri | null>(null);
  const [goc, setGoc] = useState<ViTri[]>([]);

  const tai = useCallback(() => api<HoSoNguonCung>('/cong/nguon-cung').then(setD), []);
  const hangCho = useHangCho(() => {
    setTb('Đã gửi các thửa ghi lúc mất sóng.');
    tai().catch(() => undefined);
  });
  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  async function lay(them: (v: ViTri) => void) {
    setLoi('');
    setDangLay(true);
    try {
      them(await layViTri());
    } catch (e) {
      setLoi((e as Error).message);
    } finally {
      setDangLay(false);
    }
  }

  function datLai() {
    setDiem(null);
    setGoc([]);
    setF({ ...f, declaredAreaHa: '' });
  }

  async function guiThua() {
    setLoi('');
    setTb('');
    const vung = d?.vung.find((v) => v.id === f.growingAreaId);
    let geometry: unknown;
    let saiSo: number | null = null;
    if (cach === 'diem') {
      if (!diem) return setLoi('Chưa lấy vị trí');
      geometry = { type: 'Point', coordinates: [diem.lon, diem.lat] };
      saiSo = diem.saiSoM;
    } else {
      if (goc.length < 3) return setLoi('Cần ít nhất 3 góc');
      geometry = { type: 'Polygon', coordinates: [goc.map((g) => [g.lon, g.lat])] };
      saiSo = Math.max(...goc.map((g) => g.saiSoM));
    }
    const body = {
      farmerId: f.farmerId, growingAreaId: f.growingAreaId, kind: vung?.kind === 'vung_nuoi' ? 'ao' : 'thua', crop: rong(f.crop),
      geometry, declaredAreaHa: f.declaredAreaHa ? Number(f.declaredAreaHa.replace(',', '.')) : null, gpsAccuracyM: saiSo,
    };
    if (!navigator.onLine) {
      themHangCho(body);
      hangCho.capNhat();
      setTb('Đang mất sóng: thửa đã được giữ trên máy và sẽ tự gửi khi có mạng.');
      return datLai();
    }
    try {
      const r = await api<{ code: string; dienTichHa: number; canhBao: string[] }>('/cong/nguon-cung/thua', { body });
      setTb(`Đã ghi thửa ${r.code} (${ha(r.dienTichHa)}).${r.canhBao.length ? ' Vạn Thuận sẽ kiểm tra: ' + r.canhBao.join('; ') : ''}`);
      datLai();
      await tai();
    } catch (e) {
      if (e instanceof TypeError) {
        themHangCho(body);
        hangCho.capNhat();
        setTb('Không gửi được: thửa đã được giữ trên máy và sẽ tự gửi khi có mạng.');
        return datLai();
      }
      setLoi((e as Error).message);
    }
  }

  if (!toi) return null;
  if (!d) return <KhungTrang toi={toi}>{loi ? <div className="loi">{loi}</div> : null}</KhungTrang>;
  const hoDung = d.ho.filter((h) => !h.voidedAt);
  const vungDung = d.vung.filter((v) => v.active);
  const dtRanhGioi = goc.length >= 3 ? dienTichHa(goc.map((g) => [g.lon, g.lat] as LonLat)) : 0;
  const dangDung = d.thua.filter((t) => !t.voidedAt);

  return (
    <KhungTrang toi={toi}>
      <h1>Vùng trồng của quý công ty</h1>
      <p className="phu">Đánh dấu vị trí từng thửa đất hoặc ao nuôi bằng điện thoại. Người mua ở EU cần tọa độ này để nhận cà phê từ 30/12/2026.</p>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {tb && <div className="dat">{tb}</div>}
      {hangCho.so > 0 && <div className="loi">Còn {hangCho.so} thửa ghi lúc mất sóng đang chờ gửi.</div>}

      <div className="luoi" style={{ margin: '12px 0' }}>
        <div className="o"><div className="phu">Nông hộ</div><div className="so-lon">{hoDung.length}</div></div>
        <div className="o"><div className="phu">Thửa đã đánh dấu</div><div className="so-lon">{dangDung.length}</div></div>
        <div className="o"><div className="phu">Diện tích</div><div className="so-lon">{ha(dangDung.reduce((s, t) => s + t.areaHa, 0))}</div></div>
      </div>

      {vungDung.length === 0 ? (
        <div className="o">Vạn Thuận chưa lập vùng trồng cho quý công ty. Liên hệ nhân viên thu mua để được lập vùng trước khi đánh dấu thửa.</div>
      ) : (
        <section className="o">
          <h2 style={{ marginTop: 0 }}>Đánh dấu một thửa</h2>
          <label htmlFor="ho">Hộ</label>
          <select id="ho" value={f.farmerId} onChange={(e) => setF({ ...f, farmerId: e.target.value })}>
            <option value="">Chọn hộ</option>
            {hoDung.map((h) => <option key={h.id} value={h.id}>{h.fullName} ({h.code})</option>)}
          </select>
          <button className="phu-btn nho" style={{ marginTop: 6 }} onClick={() => setMoThemHo(!moThemHo)}>{moThemHo ? 'Đóng' : 'Hộ chưa có trong danh sách? Thêm hộ'}</button>
          {moThemHo && (
            <form className="the-thua" onSubmit={async (e) => {
              e.preventDefault();
              setLoi('');
              try {
                const r = await api<{ id: string; code: string; canhBao: string[] }>('/cong/nguon-cung/ho', { body: { ...ho, idNumber: rong(ho.idNumber), phone: rong(ho.phone), commune: rong(ho.commune), district: rong(ho.district) } });
                await tai();
                setF({ ...f, farmerId: r.id });
                setHo({ ...ho, fullName: '', idNumber: '', phone: '' });
                setMoThemHo(false);
                setTb(`Đã thêm hộ ${r.code}.`);
              } catch (err) {
                setLoi((err as Error).message);
              }
            }}>
              <label htmlFor="hn">Họ tên chủ hộ</label><input id="hn" required value={ho.fullName} onChange={(e) => setHo({ ...ho, fullName: e.target.value })} />
              <label htmlFor="hc">Số CCCD</label><input id="hc" inputMode="numeric" value={ho.idNumber} onChange={(e) => setHo({ ...ho, idNumber: e.target.value })} />
              <label htmlFor="hd">Điện thoại</label><input id="hd" inputMode="tel" value={ho.phone} onChange={(e) => setHo({ ...ho, phone: e.target.value })} />
              <label htmlFor="hx">Xã</label><input id="hx" value={ho.commune} onChange={(e) => setHo({ ...ho, commune: e.target.value })} />
              <label htmlFor="hh">Huyện</label><input id="hh" value={ho.district} onChange={(e) => setHo({ ...ho, district: e.target.value })} />
              <label htmlFor="ht">Tỉnh</label><input id="ht" required value={ho.province} onChange={(e) => setHo({ ...ho, province: e.target.value })} />
              <label htmlFor="hk">Ngày hộ ký giấy đồng ý cho xử lý dữ liệu</label><input id="hk" type="date" required value={ho.consentOn} onChange={(e) => setHo({ ...ho, consentOn: e.target.value })} />
              <button className="nut-lon">Lưu hộ</button>
            </form>
          )}

          <label htmlFor="vung">Vùng</label>
          <select id="vung" value={f.growingAreaId} onChange={(e) => setF({ ...f, growingAreaId: e.target.value })}>
            <option value="">Chọn vùng</option>
            {vungDung.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
          </select>
          <label htmlFor="cay">Cây trồng / loài nuôi</label>
          <input id="cay" value={f.crop} placeholder="Robusta" onChange={(e) => setF({ ...f, crop: e.target.value })} />

          <label>Cách đánh dấu</label>
          <div className="hang">
            <button type="button" className={cach === 'diem' ? '' : 'phu-btn'} onClick={() => { setCach('diem'); setGoc([]); }}>Thửa từ 4 ha trở xuống</button>
            <button type="button" className={cach === 'ranh_gioi' ? '' : 'phu-btn'} onClick={() => { setCach('ranh_gioi'); setDiem(null); }}>Thửa trên 4 ha</button>
          </div>

          {cach === 'diem' ? (
            <>
              <p className="phu">Đứng ở khoảng giữa thửa, ngoài trời, rồi bấm nút.</p>
              <button type="button" className="nut-lon" disabled={dangLay} onClick={() => lay(setDiem)}>{dangLay ? 'Đang lấy vị trí…' : diem ? 'Lấy lại vị trí' : 'Lấy vị trí giữa thửa'}</button>
              {diem && <div className="the-thua">Vị trí: <a href={banDo(diem.lat, diem.lon)} target="_blank" rel="noreferrer">{diem.lat.toFixed(6)}, {diem.lon.toFixed(6)}</a> · sai số {diem.saiSoM} m{diem.saiSoM > 20 && <div className="canh-bao-nhe">Sai số lớn, nên ra chỗ thoáng và lấy lại.</div>}</div>}
              <label htmlFor="dt">Diện tích thửa (ha)</label>
              <input id="dt" inputMode="decimal" value={f.declaredAreaHa} onChange={(e) => setF({ ...f, declaredAreaHa: e.target.value })} placeholder="ví dụ 1,5" />
            </>
          ) : (
            <>
              <p className="phu">Đi quanh ranh giới thửa theo một chiều. Đến mỗi góc, bấm “Ghi góc này”. Đủ các góc thì bấm Lưu thửa.</p>
              <button type="button" className="nut-lon" disabled={dangLay} onClick={() => lay((v) => setGoc([...goc, v]))}>{dangLay ? 'Đang lấy vị trí…' : `Ghi góc này (góc ${goc.length + 1})`}</button>
              {goc.length > 0 && (
                <div className="the-thua">
                  Đã ghi {goc.length} góc{goc.length >= 3 && <> · diện tích khoảng <strong>{ha(Math.round(dtRanhGioi * 100) / 100)}</strong></>}
                  {goc.some((g) => g.saiSoM > 20) && <div className="canh-bao-nhe">Có góc sai số trên 20 m.</div>}
                  <div><button type="button" className="phu-btn nho" onClick={() => setGoc(goc.slice(0, -1))}>Bỏ góc vừa ghi</button></div>
                </div>
              )}
            </>
          )}
          <button type="button" className="nut-lon" disabled={!f.farmerId || !f.growingAreaId || (cach === 'diem' ? !diem || !f.declaredAreaHa : goc.length < 3)} onClick={guiThua}>Lưu thửa</button>
        </section>
      )}

      <h2>Các thửa đã đánh dấu</h2>
      <HinhThua thua={d.thua} />
      {dangDung.map((t) => {
        const h = d.ho.find((x) => x.id === t.farmerId);
        return (
          <div key={t.id} className="the-thua">
            <strong>{t.code}</strong> <span className="nhan">{LOAI_THUA[t.kind]}</span> {ha(t.areaHa)}
            <div className="phu">{h?.fullName} · {t.geometryType === 'diem' ? 'một điểm' : 'có ranh giới'} · <a href={banDo(t.tam.lat, t.tam.lon)} target="_blank" rel="noreferrer">xem bản đồ</a></div>
            {t.warnings.map((w) => <div key={w} className="canh-bao-nhe">{w}</div>)}
          </div>
        );
      })}
      <p style={{ marginTop: 16 }}><button className="phu-btn" onClick={() => taiGeojson('/cong/nguon-cung/geojson', 'thua-cua-toi').catch((e: Error) => setLoi(e.message))}>Tải tệp GeoJSON các thửa</button></p>
    </KhungTrang>
  );
}
