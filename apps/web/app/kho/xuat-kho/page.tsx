'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Kho, kg, LOAI_LO_TON, NHAN_EUDR, phanTram } from '@/lib/kho';
import { LOAI_GIAO_DICH, THI_TRUONG } from '@/lib/lo-hang';
import { ngay } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface LoXuat {
  id: string;
  code: string;
  market: string;
  dealType: string;
  commodityId: string;
  commodityName: string;
  sector: string;
  buyerName: string;
  etd: string | null;
  contractKg: number | null;
  tolerancePct: number | null;
  allocatedKg: number;
}
interface LoTon {
  id: string;
  code: string;
  zoneCode: string;
  commodityId: string;
  kind: string;
  grade: string | null;
  dealType: string;
  eudrClass: string | null;
  remainingKg: number;
  status: string;
  receivedOn: string;
  nguonGoc: { purchaseLotId: string; code: string; supplierName: string; share: number }[];
}
interface Phieu {
  id: string;
  code: string;
  exportCode: string;
  exportLotId: string;
  issuedOn: string;
  vehicleNo: string | null;
  containerNo: string | null;
  quantityKg: number;
  voidedAt: string | null;
  voidReason: string | null;
  createdByName: string;
  dong: { stockLotId: string; code: string; grade: string | null; quantityKg: number }[];
  loMua: { purchaseLotId: string; code: string; quantityKg: number; approved: boolean; cancelled: boolean }[];
  quyen: { huy: boolean };
}

const homNay = () => new Date().toISOString().slice(0, 10);

export default function XuatKho() {
  const toi = useToi();
  const [kho, setKho] = useState<Kho[]>([]);
  const [khoId, setKhoId] = useState('');
  const [loXuat, setLoXuat] = useState<LoXuat[]>([]);
  const [loTon, setLoTon] = useState<LoTon[]>([]);
  const [phieu, setPhieu] = useState<Phieu[]>([]);
  const [loi, setLoi] = useState('');
  const [bao, setBao] = useState('');
  const [f, setF] = useState({ loXuatId: '', ngayXuat: homNay(), bienSoXe: '', soContainer: '', ghiChu: '' });
  const [lay, setLay] = useState<Record<string, string>>({});
  const [huy, setHuy] = useState<{ id: string; lyDo: string } | null>(null);

  const tai = useCallback(async (id: string) => {
    const [a, b, c] = await Promise.all([
      api<{ loXuat: LoXuat[] }>('/kho/xuat-kho/lo-xuat'),
      api<{ loTon: LoTon[] }>(`/kho/lo-ton?khoId=${id}&conHang=1`),
      api<{ phieu: Phieu[] }>(`/kho/xuat-kho?khoId=${id}`),
    ]);
    setLoXuat(a.loXuat);
    setLoTon(b.loTon);
    setPhieu(c.phieu);
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
  const lx = loXuat.find((x) => x.id === f.loXuatId);
  // Chỉ gợi ý lô tồn hợp với lô xuất: cùng mặt hàng, cùng loại giao dịch, không phải phụ phẩm, sẵn sàng; cà phê đi EU phải đủ EUDR
  const hop = (x: LoTon) =>
    !!lx && x.status === 'san_sang' && x.kind !== 'phu_pham' && x.commodityId === lx.commodityId && x.dealType === lx.dealType && !(lx.market === 'EU' && lx.sector === 'ca_phe' && x.eudrClass !== 'du');
  const ungVien = loTon.filter(hop).sort((a, b) => a.receivedOn.localeCompare(b.receivedOn));
  const chon = ungVien.filter((x) => lay[x.id] !== undefined);
  const tong = chon.reduce((s, x) => s + (Number(lay[x.id]) || 0), 0);
  const toiDa = lx?.contractKg ? lx.contractKg * (1 + (lx.tolerancePct ?? 0) / 100) : null;
  const conThieu = lx?.contractKg ? Math.max(0, lx.contractKg - lx.allocatedKg) : null;
  // Xem trước phần quy về lô mua
  const quy = new Map<string, { code: string; supplierName: string; kg: number }>();
  for (const x of chon) for (const o of x.nguonGoc) {
    const v = quy.get(o.purchaseLotId) ?? { code: o.code, supplierName: o.supplierName, kg: 0 };
    v.kg += (Number(lay[x.id]) || 0) * o.share;
    quy.set(o.purchaseLotId, v);
  }

  async function ghi(e: FormEvent) {
    e.preventDefault();
    await lam(async () => {
      const r = await api<{ code: string; quantityKg: number }>('/kho/xuat-kho', {
        body: { loXuatId: f.loXuatId, khoId, ngayXuat: f.ngayXuat, bienSoXe: f.bienSoXe, soContainer: f.soContainer, ghiChu: f.ghiChu, dong: chon.map((x) => ({ loTonId: x.id, khoiLuongKg: Number(lay[x.id]) })) },
      });
      setLay({});
      setF({ ...f, bienSoXe: '', soContainer: '', ghiChu: '' });
      setBao(`Đã ghi ${r.code}, xuất ${kg(r.quantityKg)}. Các dòng phân bổ đã sang lô xuất, chờ Trưởng phòng KD duyệt.`);
    });
  }

  return (
    <KhungTrang toi={toi}>
      <p><Link href="/kho">← Kho và tồn kho</Link></p>
      <h1>Xuất kho cho lô xuất</h1>
      <p className="phu">
        Thủ kho lấy hàng từ các lô tồn cho một lô xuất. Phần mềm quy khối lượng về từng lô mua theo tỷ lệ nguồn gốc của lô tồn, rồi ghi thành các dòng phân bổ trên lô xuất để Trưởng phòng KD duyệt.
      </p>
      <div className="hang">
        <div>
          <label htmlFor="kho">Kho, xưởng</label>
          <select id="kho" value={khoId} onChange={(e) => { setKhoId(e.target.value); setLay({}); }}>
            {kho.map((x) => <option key={x.id} value={x.id}>{x.name}{x.quyen.ghiPhieu ? ' (kho của tôi)' : ''}</option>)}
          </select>
        </div>
      </div>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {bao && <div className="dat" role="status">{bao}</div>}

      {k?.quyen.ghiPhieu && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={ghi}>
          <h2 style={{ marginTop: 0 }}>Phiếu xuất kho</h2>
          <div className="hang">
            <div style={{ flexBasis: 420 }}>
              <label htmlFor="lx">Lô xuất (đang đóng gói)</label>
              <select id="lx" required value={f.loXuatId} onChange={(e) => { setF({ ...f, loXuatId: e.target.value }); setLay({}); }}>
                <option value="">Chọn lô xuất</option>
                {loXuat.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.commodityName} · {THI_TRUONG[x.market]} · {x.buyerName}</option>)}
              </select>
            </div>
            <div><label htmlFor="nx">Ngày xuất</label><input id="nx" type="date" required max={homNay()} value={f.ngayXuat} onChange={(e) => setF({ ...f, ngayXuat: e.target.value })} /></div>
          </div>
          {lx && (
            <p className="phu">
              {LOAI_GIAO_DICH[lx.dealType]} · hợp đồng {kg(lx.contractKg)} (±{lx.tolerancePct}%) · đã phân bổ {kg(lx.allocatedKg)} · còn thiếu {kg(conThieu)}
              {lx.etd ? ` · tàu dự kiến ${ngay(lx.etd)}` : ''}
              {lx.market === 'EU' && lx.sector === 'ca_phe' && ' · Cà phê đi EU: chỉ lấy hàng đủ EUDR.'}
            </p>
          )}

          {lx && (
            <div className="bang-cuon">
              <table>
                <thead><tr><th></th><th>Lô tồn</th><th>Khu</th><th>Loại, hạng</th><th>EUDR</th><th>Nguồn gốc</th><th>Nhận</th><th className="so">Còn lại</th><th className="so">Xuất (kg)</th></tr></thead>
                <tbody>
                  {ungVien.length === 0 && <tr><td colSpan={9} className="phu">Kho này không có lô tồn hợp với lô xuất này.</td></tr>}
                  {ungVien.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Chọn ${x.code}`}
                          checked={lay[x.id] !== undefined}
                          onChange={(e) => {
                            const v = { ...lay };
                            if (e.target.checked) v[x.id] = String(Math.min(x.remainingKg, Math.max(0, (conThieu ?? x.remainingKg) - tong)) || x.remainingKg);
                            else delete v[x.id];
                            setLay(v);
                          }}
                        />
                      </td>
                      <td><Link href={`/kho/lo-ton/${x.id}`}>{x.code}</Link></td>
                      <td>{x.zoneCode}</td>
                      <td>{LOAI_LO_TON[x.kind]}{x.grade ? ` · ${x.grade}` : ''}</td>
                      <td>{x.eudrClass ? <span className={`nhan ${x.eudrClass === 'du' ? 'nhan-eudr' : 'nhan-khong-eudr'}`}>{NHAN_EUDR[x.eudrClass]}</span> : '—'}</td>
                      <td>{x.nguonGoc.map((o) => <div key={o.purchaseLotId}>{o.code} <span className="phu">{phanTram(o.share)}</span></div>)}</td>
                      <td>{ngay(x.receivedOn)}</td>
                      <td className="so">{kg(x.remainingKg)}</td>
                      <td className="so">{lay[x.id] !== undefined && <input aria-label={`Xuất từ ${x.code}`} type="number" min="0" step="any" max={x.remainingKg} style={{ width: 110 }} value={lay[x.id]} onChange={(e) => setLay({ ...lay, [x.id]: e.target.value })} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {chon.length > 0 && (
            <>
              <div className="luoi">
                <div className="o"><div className="phu">Xuất phiếu này</div><div className={`so-lon ${toiDa !== null && lx!.allocatedKg + tong > toiDa + 0.005 ? 'canh-bao-nhe' : ''}`}>{kg(tong)}</div><div className="phu">{toiDa !== null ? `tối đa còn được ${kg(Math.max(0, toiDa - lx!.allocatedKg))}` : ''}</div></div>
                <div className="o">
                  <div className="phu">Quy về lô mua</div>
                  {[...quy.entries()].sort((a, b) => b[1].kg - a[1].kg).map(([id, v]) => <div key={id}>{v.code} <span className="phu">{v.supplierName}</span> · {kg(Math.round(v.kg * 100) / 100)}</div>)}
                </div>
              </div>
              <div className="hang">
                <div><label htmlFor="xe">Biển số xe</label><input id="xe" value={f.bienSoXe} onChange={(e) => setF({ ...f, bienSoXe: e.target.value })} /></div>
                <div><label htmlFor="ct">Số container</label><input id="ct" value={f.soContainer} onChange={(e) => setF({ ...f, soContainer: e.target.value })} placeholder="TGHU1234567" /></div>
                <div style={{ flexBasis: 320 }}><label htmlFor="gc">Ghi chú</label><input id="gc" value={f.ghiChu} onChange={(e) => setF({ ...f, ghiChu: e.target.value })} /></div>
                <button type="submit">Ghi phiếu xuất</button>
              </div>
            </>
          )}
        </form>
      )}

      <h2>Phiếu xuất kho</h2>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Phiếu</th><th>Ngày</th><th>Lô xuất</th><th>Lấy từ lô tồn</th><th>Quy về lô mua</th><th className="so">Khối lượng</th><th>Xe, container</th><th>Người ghi</th><th></th></tr></thead>
          <tbody>
            {phieu.length === 0 && <tr><td colSpan={9} className="phu">Chưa có phiếu.</td></tr>}
            {phieu.map((p) => (
              <tr key={p.id} className={p.voidedAt ? 'huy' : ''}>
                <td>{p.code}{p.voidReason && <div className="phu">Huỷ: {p.voidReason}</div>}</td>
                <td>{ngay(p.issuedOn)}</td>
                <td><Link href={`/lo-hang/${p.exportLotId}`}>{p.exportCode}</Link></td>
                <td>{p.dong.map((d) => <div key={d.stockLotId}><Link href={`/kho/lo-ton/${d.stockLotId}`}>{d.code}</Link> <span className="phu">{d.grade ?? ''} {kg(d.quantityKg)}</span></div>)}</td>
                <td>{p.loMua.map((m) => <div key={m.purchaseLotId}>{m.code} <span className="phu">{kg(m.quantityKg)}{m.cancelled ? ' · đã huỷ' : m.approved ? ' · đã duyệt' : ' · chờ duyệt'}</span></div>)}</td>
                <td className="so">{kg(p.quantityKg)}</td>
                <td>{[p.vehicleNo, p.containerNo].filter(Boolean).join(' · ') || '—'}</td>
                <td>{p.createdByName}</td>
                <td>
                  {p.quyen.huy && huy?.id !== p.id && <button className="phu-btn nho" onClick={() => setHuy({ id: p.id, lyDo: '' })}>Huỷ</button>}
                  {huy?.id === p.id && (
                    <span className="hang" style={{ minWidth: 260 }}>
                      <input aria-label="Lý do huỷ" placeholder="Lý do huỷ" value={huy.lyDo} onChange={(e) => setHuy({ ...huy, lyDo: e.target.value })} />
                      <button className="nho" onClick={() => lam(() => api(`/kho/xuat-kho/${p.id}/huy`, { body: { lyDo: huy.lyDo } }).then(() => setHuy(null)))}>Xác nhận</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </KhungTrang>
  );
}
