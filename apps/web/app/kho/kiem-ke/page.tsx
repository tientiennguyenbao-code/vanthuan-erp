'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Kho, kg, LOAI_LO_TON, TRANG_THAI_KIEM_KE } from '@/lib/kho';
import { ngay } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface Dong {
  stockLotId: string;
  code: string;
  grade: string | null;
  kind: string;
  zoneCode: string;
  commodityName: string;
  bookKg: number;
  countedKg: number | null;
  note: string | null;
  diffKg: number | null;
  diffPct: number | null;
  overTolerance: boolean;
}
interface Dot {
  id: string;
  code: string;
  facilityId: string;
  facilityName: string;
  period: string;
  countedOn: string;
  status: string;
  note: string | null;
  createdByName: string;
  decidedByName: string | null;
  decisionNote: string | null;
  tolerancePct: number;
  tong: { bookKg: number; countedKg: number; daDem: number; vuot: number };
  dong: Dong[];
  quyen: { ghi: boolean; duyet: boolean };
}

const homNay = () => new Date().toISOString().slice(0, 10);
const nguong = (v: number) => `${v.toLocaleString('vi-VN')}%`;
const pct = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`);

export default function KiemKe() {
  const toi = useToi();
  const [kho, setKho] = useState<Kho[]>([]);
  const [khoId, setKhoId] = useState('');
  const [dot, setDot] = useState<Dot[]>([]);
  const [mo, setMo] = useState('');
  const [so, setSo] = useState<Record<string, { kg: string; ghiChu: string }>>({});
  const [ngayDem, setNgayDem] = useState(homNay());
  const [ghiChuTraLai, setGhiChuTraLai] = useState('');
  const [loi, setLoi] = useState('');
  const [bao, setBao] = useState('');

  const tai = useCallback(async (id: string) => {
    const a = await api<{ dot: Dot[] }>(`/kho/kiem-ke${id ? `?khoId=${id}` : ''}`);
    setDot(a.dot);
    return a.dot;
  }, []);
  useEffect(() => {
    if (!toi) return;
    api<{ kho: Kho[] }>('/kho')
      .then((a) => {
        setKho(a.kho);
        setKhoId((a.kho.find((x) => x.quyen.ghiPhieu) ?? a.kho[0])?.id ?? '');
      })
      .catch((e: Error) => setLoi(e.message));
  }, [toi]);
  useEffect(() => {
    if (!khoId) return;
    tai(khoId)
      .then((ds) => {
        const dang = ds.find((d) => d.status === 'dang_dem' || d.status === 'cho_duyet');
        setMo(dang?.id ?? '');
        setSo(Object.fromEntries((dang?.dong ?? []).map((l) => [l.stockLotId, { kg: l.countedKg === null ? '' : String(l.countedKg), ghiChu: l.note ?? '' }])));
      })
      .catch((e: Error) => setLoi(e.message));
  }, [khoId, tai]);

  async function lam(viec: () => Promise<string | void>) {
    setLoi('');
    setBao('');
    try {
      const b = await viec();
      await tai(khoId);
      if (b) setBao(b);
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  if (!toi) return null;
  const k = kho.find((x) => x.id === khoId);
  const d = dot.find((x) => x.id === mo);
  const dangMo = dot.some((x) => x.status === 'dang_dem' || x.status === 'cho_duyet');
  // Xem trước chênh lệch theo số đang gõ
  const xem = (l: Dong) => {
    const v = so[l.stockLotId]?.kg;
    if (!d?.quyen.ghi || v === undefined || v === '') return l;
    const c = Number(v);
    const diffKg = Math.round((c - l.bookKg) * 100) / 100;
    const diffPct = l.bookKg > 0 ? Math.round((diffKg / l.bookKg) * 10000) / 100 : c > 0 ? 100 : 0;
    return { ...l, countedKg: c, diffKg, diffPct, overTolerance: Math.abs(diffPct) > (d?.tolerancePct ?? 0.5) + 1e-9 };
  };
  const ghiSo = () =>
    api(`/kho/kiem-ke/${mo}/so-dem`, {
      body: { dong: Object.entries(so).filter(([, v]) => v.kg !== '').map(([loTonId, v]) => ({ loTonId, soDemKg: Number(v.kg), ghiChu: v.ghiChu })) },
    });

  return (
    <KhungTrang toi={toi}>
      <p><Link href="/kho">← Kho và tồn kho</Link></p>
      <h1>Kiểm kê tháng</h1>
      <p className="phu">
        Mở đợt thì phần mềm chụp số sổ của mọi lô tồn còn hàng. Thủ kho đếm, ghi số từng lô rồi chốt. Không lô nào lệch quá {nguong(d?.tolerancePct ?? 0.5)} thì sổ được điều chỉnh ngay; có lô lệch hơn thì Kế toán trưởng duyệt hoặc trả lại để đếm lại. Sổ điều chỉnh theo phần chênh, nên hàng ra vào trong lúc đếm vẫn giữ đúng.
      </p>
      <div className="hang">
        <div>
          <label htmlFor="kho">Kho, xưởng</label>
          <select id="kho" value={khoId} onChange={(e) => setKhoId(e.target.value)}>
            {kho.map((x) => <option key={x.id} value={x.id}>{x.name}{x.quyen.ghiPhieu ? ' (kho của tôi)' : ''}</option>)}
          </select>
        </div>
        {k?.quyen.ghiPhieu && !dangMo && (
          <>
            <div><label htmlFor="nd">Ngày đếm</label><input id="nd" type="date" max={homNay()} value={ngayDem} onChange={(e) => setNgayDem(e.target.value)} /></div>
            <button
              onClick={() =>
                lam(async () => {
                  const r = await api<{ id: string; code: string; lines: number }>('/kho/kiem-ke', { body: { khoId, ngayDem, ghiChu: null } });
                  const ds = await tai(khoId);
                  setMo(r.id);
                  setSo(Object.fromEntries((ds.find((x) => x.id === r.id)?.dong ?? []).map((l) => [l.stockLotId, { kg: '', ghiChu: '' }])));
                  return `Đã mở ${r.code} với ${r.lines} lô tồn.`;
                })
              }
            >
              Mở đợt kiểm kê
            </button>
          </>
        )}
      </div>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {bao && <div className="dat" role="status">{bao}</div>}

      {d && (
        <div className="o" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0 }}>{d.code} · tháng {d.period.slice(5)}/{d.period.slice(0, 4)} · {TRANG_THAI_KIEM_KE[d.status]}</h2>
          <div className="luoi">
            <div className="o"><div className="phu">Số trên sổ lúc mở</div><div className="so-lon">{kg(d.tong.bookKg)}</div><div className="phu">{d.dong.length} lô tồn</div></div>
            <div className="o"><div className="phu">Đã đếm</div><div className="so-lon">{d.tong.daDem}/{d.dong.length} lô</div><div className="phu">{kg(d.tong.countedKg)}</div></div>
            <div className="o"><div className="phu">Lệch quá {nguong(d.tolerancePct)}</div><div className={`so-lon ${d.tong.vuot ? 'canh-bao-nhe' : ''}`}>{d.tong.vuot} lô</div><div className="phu">{d.tong.vuot ? 'cần Kế toán trưởng duyệt' : 'chốt là điều chỉnh ngay'}</div></div>
          </div>
          <div className="bang-cuon">
            <table>
              <thead><tr><th>Khu</th><th>Lô tồn</th><th>Mặt hàng</th><th className="so">Sổ</th><th className="so">Đếm (kg)</th><th className="so">Chênh</th><th className="so">%</th><th>Ghi chú</th></tr></thead>
              <tbody>
                {d.dong.map((l0) => {
                  const l = xem(l0);
                  return (
                    <tr key={l.stockLotId}>
                      <td>{l.zoneCode}</td>
                      <td><Link href={`/kho/lo-ton/${l.stockLotId}`}>{l.code}</Link></td>
                      <td>{l.commodityName} <span className="phu">{l.grade ?? LOAI_LO_TON[l.kind]}</span></td>
                      <td className="so">{kg(l.bookKg)}</td>
                      <td className="so">
                        {d.quyen.ghi ? (
                          <input aria-label={`Số đếm ${l.code}`} type="number" min="0" step="any" style={{ width: 110 }} value={so[l.stockLotId]?.kg ?? ''} onChange={(e) => setSo({ ...so, [l.stockLotId]: { ghiChu: so[l.stockLotId]?.ghiChu ?? '', kg: e.target.value } })} />
                        ) : (
                          kg(l.countedKg)
                        )}
                      </td>
                      <td className={`so ${l.overTolerance ? 'canh-bao-nhe' : ''}`}>{l.diffKg === null ? '—' : kg(l.diffKg)}</td>
                      <td className={`so ${l.overTolerance ? 'canh-bao-nhe' : ''}`}>{pct(l.diffPct)}</td>
                      <td>
                        {d.quyen.ghi ? (
                          <input aria-label={`Ghi chú ${l.code}`} value={so[l.stockLotId]?.ghiChu ?? ''} onChange={(e) => setSo({ ...so, [l.stockLotId]: { kg: so[l.stockLotId]?.kg ?? '', ghiChu: e.target.value } })} />
                        ) : (
                          l.note ?? ''
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {d.quyen.ghi && (
            <div className="hang">
              <button className="phu-btn" onClick={() => lam(async () => { await ghiSo(); return 'Đã lưu số đếm.'; })}>Lưu số đếm</button>
              <button
                onClick={() =>
                  lam(async () => {
                    await ghiSo();
                    const r = await api<{ status: string; overTolerance: number }>(`/kho/kiem-ke/${mo}/chot`, { body: {} });
                    return r.status === 'cho_duyet' ? `Đã chốt. ${r.overTolerance} lô lệch quá ngưỡng, chờ Kế toán trưởng duyệt.` : 'Đã chốt và điều chỉnh sổ.';
                  })
                }
              >
                Chốt kiểm kê
              </button>
            </div>
          )}
          {d.quyen.duyet && (
            <div className="hang">
              <div style={{ flexBasis: 360 }}><label htmlFor="tl">Ghi chú (bắt buộc khi trả lại)</label><input id="tl" value={ghiChuTraLai} onChange={(e) => setGhiChuTraLai(e.target.value)} /></div>
              <button onClick={() => lam(async () => { await api(`/kho/kiem-ke/${mo}/duyet`, { body: { dongY: true, ghiChu: ghiChuTraLai } }); return 'Đã duyệt, sổ đã điều chỉnh theo số đếm.'; })}>Duyệt, điều chỉnh sổ</button>
              <button className="phu-btn" onClick={() => lam(async () => { await api(`/kho/kiem-ke/${mo}/duyet`, { body: { dongY: false, ghiChu: ghiChuTraLai } }); return 'Đã trả lại. Thủ kho mở đợt mới để đếm lại.'; })}>Trả lại để đếm lại</button>
            </div>
          )}
        </div>
      )}

      <h2>Các đợt kiểm kê</h2>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Đợt</th><th>Tháng</th><th>Ngày đếm</th><th className="so">Sổ</th><th className="so">Đếm</th><th className="so">Lệch quá ngưỡng</th><th>Trạng thái</th><th>Người duyệt</th></tr></thead>
          <tbody>
            {dot.length === 0 && <tr><td colSpan={8} className="phu">Kho này chưa có đợt kiểm kê.</td></tr>}
            {dot.map((x) => (
              <tr key={x.id} className={x.status === 'tu_choi' ? 'huy' : ''}>
                <td><button className="lien-ket" onClick={() => setMo(x.id)}>{x.code}</button><div className="phu">{x.createdByName}</div></td>
                <td>{x.period.slice(5)}/{x.period.slice(0, 4)}</td>
                <td>{ngay(x.countedOn)}</td>
                <td className="so">{kg(x.tong.bookKg)}</td>
                <td className="so">{kg(x.tong.countedKg)}</td>
                <td className="so">{x.tong.vuot}</td>
                <td>{TRANG_THAI_KIEM_KE[x.status]}{x.decisionNote && <div className="phu">{x.decisionNote}</div>}</td>
                <td>{x.decidedByName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </KhungTrang>
  );
}
