'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Kho, kg, LOAI_KHU, LOAI_LO_TON, NHAN_EUDR, TRANG_THAI_LENH } from '@/lib/kho';
import { LOAI_GIAO_DICH } from '@/lib/lo-hang';
import { NGANH, ngay } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface LoTon {
  id: string;
  code: string;
  zoneCode: string;
  commodityId: string;
  commodityName: string;
  sector: string;
  kind: string;
  grade: string | null;
  dealType: string;
  eudrClass: string | null;
  remainingKg: number;
  status: string;
  nguonGoc: { purchaseLotId: string; code: string; supplierName: string; share: number }[];
}
interface DinhMuc { sector: string; step: string; label: string; maxLossPct: number | null; setByName: string | null; setAt: string | null }
interface Lenh {
  id: string;
  code: string;
  facilityName: string;
  commodityName: string;
  stepLabel: string;
  processedOn: string;
  inputKg: number;
  outputKg: number;
  byproductKg: number;
  lossKg: number;
  lossPct: number;
  normPct: number | null;
  status: string;
  overReason: string | null;
  note: string | null;
  decisionNote: string | null;
  createdByName: string;
  dauVao: { stockLotId: string; code: string; quantityKg: number }[];
  dauRa: { id: string; code: string; kind: string; grade: string | null; initialKg: number; zoneCode: string; status: string }[];
  quyen: { duyet: boolean };
}
interface DongRa { loai: 'thanh_pham' | 'phu_pham'; hang: string; khoiLuongKg: string; soBao: string; khuId: string }

const homNay = () => new Date().toISOString().slice(0, 10);
const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`);
const dongMoi = (loai: DongRa['loai'] = 'thanh_pham'): DongRa => ({ loai, hang: '', khoiLuongKg: '', soBao: '', khuId: '' });

export default function SoChe() {
  const toi = useToi();
  const [kho, setKho] = useState<Kho[]>([]);
  const [khoId, setKhoId] = useState('');
  const [loTon, setLoTon] = useState<LoTon[]>([]);
  const [dinhMuc, setDinhMuc] = useState<{ dinhMuc: DinhMuc[]; quyen: { dat: boolean } } | null>(null);
  const [lenh, setLenh] = useState<Lenh[]>([]);
  const [loi, setLoi] = useState('');
  const [bao, setBao] = useState('');
  const [vao, setVao] = useState<Record<string, string>>({});
  const [ra, setRa] = useState<DongRa[]>([dongMoi()]);
  const [f, setF] = useState({ congDoan: '', ngay: homNay(), lyDoVuot: '', ghiChu: '' });
  const [quyetDinh, setQuyetDinh] = useState<{ id: string; ghiChu: string } | null>(null);
  const [sua, setSua] = useState<Record<string, string>>({});

  const tai = useCallback(async (id: string) => {
    const [a, b, c] = await Promise.all([
      api<{ loTon: LoTon[] }>(`/kho/lo-ton?khoId=${id}&conHang=1`),
      api<{ lenh: Lenh[] }>(`/kho/so-che?khoId=${id}`),
      api<{ dinhMuc: DinhMuc[]; quyen: { dat: boolean } }>('/kho/dinh-muc'),
    ]);
    setLoTon(a.loTon);
    setLenh(b.lenh);
    setDinhMuc(c);
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
    if (khoId) tai(khoId).catch((e: Error) => setLoi(e.message));
  }, [khoId, tai]);

  async function lam(viec: () => Promise<unknown>) {
    setLoi('');
    setBao('');
    try {
      await viec();
      await tai(khoId);
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  if (!toi) return null;
  const k = kho.find((x) => x.id === khoId);
  const dungDuoc = loTon.filter((x) => x.status === 'san_sang' && x.kind !== 'phu_pham');
  const daChon = dungDuoc.filter((x) => vao[x.id] !== undefined);
  const dau = daChon[0];
  // Chỉ gợi ý các lô trộn được với lô đầu tiên đã chọn (KS-1)
  const tronDuoc = (x: LoTon) => {
    if (!dau || x.id === dau.id) return true;
    if (x.commodityId !== dau.commodityId || x.eudrClass !== dau.eudrClass || x.dealType !== dau.dealType) return false;
    if (dau.dealType === 'moi_gioi') {
      const ncc = new Set(daChon.flatMap((l) => l.nguonGoc.map((o) => o.supplierName)));
      return x.nguonGoc.every((o) => ncc.has(o.supplierName));
    }
    return true;
  };
  const congDoan = dinhMuc?.dinhMuc.filter((d) => d.sector === dau?.sector) ?? [];
  const dm = congDoan.find((d) => d.step === f.congDoan);
  const tongVao = daChon.reduce((s, x) => s + (Number(vao[x.id]) || 0), 0);
  const tongTp = ra.filter((r) => r.loai === 'thanh_pham').reduce((s, r) => s + (Number(r.khoiLuongKg) || 0), 0);
  const tongPp = ra.filter((r) => r.loai === 'phu_pham').reduce((s, r) => s + (Number(r.khoiLuongKg) || 0), 0);
  const haoHut = tongVao - tongTp - tongPp;
  const haoHutPct = tongVao > 0 ? Math.round((haoHut / tongVao) * 10000) / 100 : 0;
  const tangKhoi = f.congDoan === 'ma_bang';
  const canDuyet = !!f.congDoan && !tangKhoi && (dm?.maxLossPct === null || dm?.maxLossPct === undefined || haoHutPct > dm.maxLossPct + 0.005);
  const khuDung = (k?.khu ?? []).filter((z) => z.active && (dau?.sector === 'thuy_san' ? z.kind === 'kho_lanh' : dau?.eudrClass === 'du' ? z.kind === 'du_eudr' : z.kind === 'thuong'));

  async function ghi(e: FormEvent) {
    e.preventDefault();
    await lam(async () => {
      const r = await api<{ code: string; status: string; lossPct: number; outputCodes: string[] }>('/kho/so-che', {
        body: {
          khoId,
          congDoan: f.congDoan,
          ngay: f.ngay,
          dauVao: daChon.map((x) => ({ loTonId: x.id, khoiLuongKg: Number(vao[x.id]) })),
          dauRa: ra.map((d) => ({ loai: d.loai, hang: d.hang || null, khoiLuongKg: Number(d.khoiLuongKg), soBao: d.soBao ? Number(d.soBao) : null, khuId: d.khuId })),
          lyDoVuot: f.lyDoVuot || null,
          ghiChu: f.ghiChu || null,
        },
      });
      setVao({});
      setRa([dongMoi()]);
      setF({ ...f, lyDoVuot: '', ghiChu: '' });
      setBao(
        r.status === 'cho_duyet'
          ? `Đã ghi ${r.code}. Hao hụt ${pct(r.lossPct)} đã trình Giám đốc; các lô ${r.outputCodes.join(', ')} chưa dùng được cho tới khi duyệt.`
          : `Đã ghi ${r.code}, hàng ra thành các lô tồn ${r.outputCodes.join(', ')}.`,
      );
    });
  }

  const choDuyet = lenh.filter((l) => l.status === 'cho_duyet');
  return (
    <KhungTrang toi={toi}>
      <p><Link href="/kho">← Kho và tồn kho</Link></p>
      <h1>Sơ chế</h1>
      <p className="phu">
        Một lệnh sơ chế lấy hàng từ các lô tồn, cho ra các lô tồn mới theo hạng, cộng phụ phẩm và hao hụt. Lô ra mang nguồn gốc theo đúng tỷ lệ khối lượng các lô vào. Hao hụt vượt định mức Giám đốc đặt thì lô ra chờ Giám đốc duyệt mới dùng được.
      </p>
      <div className="hang">
        <div>
          <label htmlFor="kho">Kho, xưởng</label>
          <select id="kho" value={khoId} onChange={(e) => { setKhoId(e.target.value); setVao({}); setRa([dongMoi()]); }}>
            {kho.map((x) => <option key={x.id} value={x.id}>{x.name}{x.quyen.ghiPhieu ? ' (kho của tôi)' : ''}</option>)}
          </select>
        </div>
      </div>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {bao && <div className="dat" role="status">{bao}</div>}

      {choDuyet.some((l) => l.quyen.duyet) && (
        <>
          <h2>Chờ Giám đốc duyệt hao hụt</h2>
          {choDuyet.map((l) => (
            <div key={l.id} className="o" style={{ marginBottom: 12 }}>
              <div><strong>{l.code}</strong> · {l.stepLabel} · {l.commodityName} · {ngay(l.processedOn)} · {l.createdByName}</div>
              <div className="canh-bao-nhe">Hao hụt {pct(l.lossPct)} ({kg(l.lossKg)}), định mức {l.normPct === null ? 'chưa đặt' : pct(l.normPct)}</div>
              <div>Lý do của thủ kho: {l.overReason}</div>
              <div className="phu">Vào {l.dauVao.map((v) => `${v.code} ${kg(v.quantityKg)}`).join(', ')} → ra {l.dauRa.map((x) => `${x.code} ${x.grade ?? LOAI_LO_TON[x.kind]} ${kg(x.initialKg)}`).join(', ')}</div>
              <div className="hang" style={{ marginTop: 8 }}>
                <div style={{ flexBasis: 320 }}>
                  <label htmlFor={`gc-${l.id}`}>Ghi chú (bắt buộc khi từ chối)</label>
                  <input id={`gc-${l.id}`} value={quyetDinh?.id === l.id ? quyetDinh.ghiChu : ''} onChange={(e) => setQuyetDinh({ id: l.id, ghiChu: e.target.value })} />
                </div>
                <button onClick={() => lam(() => api(`/kho/so-che/${l.id}/duyet`, { body: { dongY: true, ghiChu: quyetDinh?.id === l.id ? quyetDinh.ghiChu || null : null } }).then(() => setQuyetDinh(null)))}>Duyệt</button>
                <button className="phu-btn" onClick={() => lam(() => api(`/kho/so-che/${l.id}/duyet`, { body: { dongY: false, ghiChu: quyetDinh?.id === l.id ? quyetDinh.ghiChu || null : null } }).then(() => setQuyetDinh(null)))}>Từ chối, trả hàng về lô vào</button>
              </div>
            </div>
          ))}
        </>
      )}

      {k?.quyen.ghiPhieu && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={ghi}>
          <h2 style={{ marginTop: 0 }}>Ghi lệnh sơ chế</h2>
          <h3>1. Hàng đưa vào</h3>
          <p className="phu">Chỉ trộn các lô cùng mặt hàng, cùng nhãn EUDR, cùng loại giao dịch. Hàng môi giới chỉ trộn các lô của cùng một nhà cung cấp.</p>
          <div className="bang-cuon">
            <table>
              <thead><tr><th></th><th>Lô tồn</th><th>Khu</th><th>Mặt hàng</th><th>Loại, hạng</th><th>Giao dịch, EUDR</th><th className="so">Còn lại</th><th className="so">Lấy vào (kg)</th></tr></thead>
              <tbody>
                {dungDuoc.length === 0 && <tr><td colSpan={8} className="phu">Kho này chưa có lô tồn dùng được.</td></tr>}
                {dungDuoc.map((x) => {
                  const chon = vao[x.id] !== undefined;
                  const duoc = chon || tronDuoc(x);
                  return (
                    <tr key={x.id} className={duoc ? '' : 'mo'}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Chọn ${x.code}`}
                          disabled={!duoc}
                          checked={chon}
                          onChange={(e) => {
                            const v = { ...vao };
                            if (e.target.checked) v[x.id] = String(x.remainingKg);
                            else delete v[x.id];
                            setVao(v);
                          }}
                        />
                      </td>
                      <td><Link href={`/kho/lo-ton/${x.id}`}>{x.code}</Link></td>
                      <td>{x.zoneCode}</td>
                      <td>{x.commodityName}</td>
                      <td>{LOAI_LO_TON[x.kind]}{x.grade ? ` · ${x.grade}` : ''}</td>
                      <td>{LOAI_GIAO_DICH[x.dealType]}{x.eudrClass && <> · <span className={`nhan ${x.eudrClass === 'du' ? 'nhan-eudr' : 'nhan-khong-eudr'}`}>{NHAN_EUDR[x.eudrClass]}</span></>}</td>
                      <td className="so">{kg(x.remainingKg)}</td>
                      <td className="so">{chon && <input aria-label={`Lấy từ ${x.code}`} type="number" min="0" step="any" max={x.remainingKg} style={{ width: 110 }} value={vao[x.id]} onChange={(e) => setVao({ ...vao, [x.id]: e.target.value })} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {dau && (
            <>
              <div className="hang">
                <div>
                  <label htmlFor="cd">Công đoạn ({NGANH[dau.sector]})</label>
                  <select id="cd" required value={f.congDoan} onChange={(e) => setF({ ...f, congDoan: e.target.value })}>
                    <option value="">Chọn công đoạn</option>
                    {congDoan.map((d) => <option key={d.step} value={d.step}>{d.label}{d.maxLossPct === null ? ' (chưa có định mức)' : ` (định mức ${pct(d.maxLossPct)})`}</option>)}
                  </select>
                </div>
                <div><label htmlFor="ng">Ngày sơ chế</label><input id="ng" type="date" required max={homNay()} value={f.ngay} onChange={(e) => setF({ ...f, ngay: e.target.value })} /></div>
              </div>

              <h3>2. Hàng ra</h3>
              <p className="phu">Mỗi hạng một dòng, thành một lô tồn mới. Phụ phẩm (vỏ, đá, hạt vỡ…) ghi riêng, không dùng cho hàng xuất khẩu.</p>
              {ra.map((d, i) => (
                <div key={i} className="hang">
                  <div>
                    <label htmlFor={`rl-${i}`}>Loại</label>
                    <select id={`rl-${i}`} value={d.loai} onChange={(e) => setRa(ra.map((x, j) => (j === i ? { ...x, loai: e.target.value as DongRa['loai'] } : x)))}>
                      <option value="thanh_pham">Thành phẩm</option>
                      <option value="phu_pham">Phụ phẩm</option>
                    </select>
                  </div>
                  <div><label htmlFor={`rh-${i}`}>Hạng</label><input id={`rh-${i}`} value={d.hang} onChange={(e) => setRa(ra.map((x, j) => (j === i ? { ...x, hang: e.target.value } : x)))} placeholder={dau.sector === 'thuy_san' ? 'VD: 31/40' : 'VD: S18'} /></div>
                  <div><label htmlFor={`rk-${i}`}>Khối lượng (kg)</label><input id={`rk-${i}`} type="number" min="0" step="any" required value={d.khoiLuongKg} onChange={(e) => setRa(ra.map((x, j) => (j === i ? { ...x, khoiLuongKg: e.target.value } : x)))} /></div>
                  <div><label htmlFor={`rb-${i}`}>Số bao</label><input id={`rb-${i}`} type="number" min="0" step="1" value={d.soBao} onChange={(e) => setRa(ra.map((x, j) => (j === i ? { ...x, soBao: e.target.value } : x)))} /></div>
                  <div>
                    <label htmlFor={`rz-${i}`}>Vào khu</label>
                    <select id={`rz-${i}`} required value={d.khuId} onChange={(e) => setRa(ra.map((x, j) => (j === i ? { ...x, khuId: e.target.value } : x)))}>
                      <option value="">Chọn khu</option>
                      {khuDung.map((z) => <option key={z.id} value={z.id}>{z.code} · {LOAI_KHU[z.kind]}</option>)}
                    </select>
                  </div>
                  {ra.length > 1 && <button type="button" className="phu-btn nho" onClick={() => setRa(ra.filter((_, j) => j !== i))}>Bỏ dòng</button>}
                </div>
              ))}
              <p>
                <button type="button" className="phu-btn nho" onClick={() => setRa([...ra, dongMoi()])}>+ Thêm hạng</button>{' '}
                <button type="button" className="phu-btn nho" onClick={() => setRa([...ra, dongMoi('phu_pham')])}>+ Thêm phụ phẩm</button>
              </p>

              <div className="luoi">
                <div className="o"><div className="phu">Vào</div><div className="so-lon">{kg(tongVao)}</div></div>
                <div className="o"><div className="phu">Ra</div><div className="so-lon">{kg(tongTp)}</div><div className="phu">phụ phẩm {kg(tongPp)}</div></div>
                <div className="o">
                  <div className="phu">{tangKhoi ? 'Tăng khối (lớp băng)' : 'Hao hụt'}</div>
                  <div className={`so-lon ${canDuyet && tongTp > 0 ? 'canh-bao-nhe' : ''}`}>{kg(Math.abs(haoHut))} · {pct(Math.abs(haoHutPct))}</div>
                  <div className="phu">{tangKhoi ? 'không so định mức' : dm ? (dm.maxLossPct === null ? 'công đoạn chưa có định mức' : `định mức ${pct(dm.maxLossPct)}`) : 'chọn công đoạn'}</div>
                </div>
              </div>
              {canDuyet && tongTp > 0 && (
                <div className="hang">
                  <div style={{ flexBasis: 480 }}>
                    <label htmlFor="ld">Lý do hao hụt (trình Giám đốc duyệt)</label>
                    <input id="ld" required value={f.lyDoVuot} onChange={(e) => setF({ ...f, lyDoVuot: e.target.value })} placeholder="VD: hàng ẩm, nhiều tạp chất" />
                  </div>
                </div>
              )}
              <div className="hang">
                <div style={{ flexBasis: 400 }}><label htmlFor="gc">Ghi chú</label><input id="gc" value={f.ghiChu} onChange={(e) => setF({ ...f, ghiChu: e.target.value })} /></div>
                <button type="submit">{canDuyet && tongTp > 0 ? 'Ghi lệnh, trình duyệt' : 'Ghi lệnh'}</button>
              </div>
            </>
          )}
        </form>
      )}

      <h2>Lệnh sơ chế</h2>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Lệnh</th><th>Ngày</th><th>Công đoạn</th><th>Vào</th><th>Ra</th><th className="so">Hao hụt</th><th>Trạng thái</th><th>Người ghi</th></tr></thead>
          <tbody>
            {lenh.length === 0 && <tr><td colSpan={8} className="phu">Chưa có lệnh sơ chế.</td></tr>}
            {lenh.map((l) => (
              <tr key={l.id} className={l.status === 'tu_choi' ? 'huy' : ''}>
                <td>{l.code}{l.note && <div className="phu">{l.note}</div>}</td>
                <td>{ngay(l.processedOn)}</td>
                <td>{l.stepLabel}<div className="phu">{l.commodityName}</div></td>
                <td>{l.dauVao.map((v) => <div key={v.stockLotId}><Link href={`/kho/lo-ton/${v.stockLotId}`}>{v.code}</Link> <span className="phu">{kg(v.quantityKg)}</span></div>)}</td>
                <td>{l.dauRa.map((x) => <div key={x.id}><Link href={`/kho/lo-ton/${x.id}`}>{x.code}</Link> <span className="phu">{x.grade ?? LOAI_LO_TON[x.kind]} · {kg(x.initialKg)} · {x.zoneCode}</span></div>)}</td>
                <td className="so">{pct(l.lossPct)}<div className="phu">{l.normPct === null ? 'chưa có định mức' : `định mức ${pct(l.normPct)}`}</div></td>
                <td>{TRANG_THAI_LENH[l.status]}{l.overReason && <div className="phu">Lý do: {l.overReason}</div>}{l.decisionNote && <div className="phu">GĐ: {l.decisionNote}</div>}</td>
                <td>{l.createdByName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dinhMuc && (
        <>
          <h2>Định mức hao hụt</h2>
          <p className="phu">Giám đốc, Phó Giám đốc đặt mức hao hụt tối đa cho từng công đoạn. Công đoạn chưa có định mức thì mọi lệnh đều phải trình duyệt.</p>
          <div className="bang-cuon">
            <table>
              <thead><tr><th>Ngành</th><th>Công đoạn</th><th className="so">Tối đa</th><th>Người đặt</th>{dinhMuc.quyen.dat && <th></th>}</tr></thead>
              <tbody>
                {dinhMuc.dinhMuc.map((d) => {
                  const key = `${d.sector}:${d.step}`;
                  return (
                    <tr key={key}>
                      <td>{NGANH[d.sector]}</td>
                      <td>{d.label}</td>
                      <td className="so">{d.step === 'ma_bang' ? 'tăng khối' : pct(d.maxLossPct)}</td>
                      <td>{d.setByName ? `${d.setByName}, ${ngay(d.setAt!)}` : '—'}</td>
                      {dinhMuc.quyen.dat && (
                        <td>
                          {d.step !== 'ma_bang' && (
                            <span className="hang" style={{ flexWrap: 'nowrap' }}>
                              <input aria-label={`Định mức ${d.label}`} type="number" min="0" max="100" step="any" style={{ width: 80 }} value={sua[key] ?? ''} placeholder="%" onChange={(e) => setSua({ ...sua, [key]: e.target.value })} />
                              <button className="nho" disabled={!sua[key]} onClick={() => lam(() => api('/kho/dinh-muc', { body: { nganh: d.sector, congDoan: d.step, phanTram: Number(sua[key]) } }).then(() => setSua({ ...sua, [key]: '' })))}>Đặt</button>
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </KhungTrang>
  );
}
