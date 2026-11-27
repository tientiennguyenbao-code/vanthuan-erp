'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Kho, kg, LOAI_LO_TON, NHAN_EUDR, TRANG_THAI_CHUYEN } from '@/lib/kho';
import { ngay } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface LoTon { id: string; code: string; zoneCode: string; commodityName: string; kind: string; grade: string | null; eudrClass: string | null; remainingKg: number; status: string }
interface Phieu {
  id: string;
  code: string;
  stockLotId: string;
  lotCode: string;
  grade: string | null;
  commodityName: string;
  sector: string;
  eudrClass: string | null;
  fromFacilityId: string;
  toFacilityId: string;
  fromName: string;
  toName: string;
  quantityKg: number;
  sentOn: string;
  vehicleNo: string | null;
  note: string | null;
  status: string;
  receivedKg: number | null;
  receivedOn: string | null;
  receivedStockLotId: string | null;
  receivedStockLotCode: string | null;
  lossKg: number | null;
  cancelReason: string | null;
  createdByName: string;
  quyen: { nhan: boolean; huy: boolean };
}

const homNay = () => new Date().toISOString().slice(0, 10);

export default function ChuyenKho() {
  const toi = useToi();
  const [kho, setKho] = useState<Kho[]>([]);
  const [khoId, setKhoId] = useState('');
  const [loTon, setLoTon] = useState<LoTon[]>([]);
  const [phieu, setPhieu] = useState<Phieu[]>([]);
  const [loi, setLoi] = useState('');
  const [bao, setBao] = useState('');
  const [f, setF] = useState({ loTonId: '', denKhoId: '', khoiLuongKg: '', ngayChuyen: homNay(), bienSoXe: '', ghiChu: '' });
  const [nhan, setNhan] = useState<{ id: string; khuId: string; kg: string; ngay: string; bao: string } | null>(null);
  const [huy, setHuy] = useState<{ id: string; lyDo: string } | null>(null);

  const tai = useCallback(async (id: string) => {
    const [a, b] = await Promise.all([api<{ loTon: LoTon[] }>(`/kho/lo-ton?khoId=${id}&conHang=1`), api<{ phieu: Phieu[] }>(`/kho/chuyen-kho?khoId=${id}`)]);
    setLoTon(a.loTon.filter((x) => x.status === 'san_sang'));
    setPhieu(b.phieu);
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
  const lt = loTon.find((x) => x.id === f.loTonId);
  const den = kho.filter((x) => x.id !== khoId);

  async function ghi(e: FormEvent) {
    e.preventDefault();
    await lam(async () => {
      const r = await api<{ code: string }>('/kho/chuyen-kho', { body: { ...f, khoiLuongKg: Number(f.khoiLuongKg) } });
      setF({ ...f, loTonId: '', khoiLuongKg: '', bienSoXe: '', ghiChu: '' });
      setBao(`Đã ghi ${r.code}. Hàng đang đi đường cho tới khi kho đến cân lại và nhận.`);
    });
  }

  async function xacNhan(p: Phieu) {
    if (!nhan) return;
    await lam(async () => {
      const r = await api<{ stockLotCode: string; lossKg: number; lossPct: number }>(`/kho/chuyen-kho/${p.id}/nhan`, {
        body: { khuId: nhan.khuId, khoiLuongNhanKg: Number(nhan.kg), ngayNhan: nhan.ngay, soBao: nhan.bao ? Number(nhan.bao) : null },
      });
      setNhan(null);
      setBao(`Đã nhận vào lô tồn ${r.stockLotCode}. Hao hụt vận chuyển ${kg(r.lossKg)} (${r.lossPct.toLocaleString('vi-VN')}%).`);
    });
  }

  return (
    <KhungTrang toi={toi}>
      <p><Link href="/kho">← Kho và tồn kho</Link></p>
      <h1>Chuyển kho</h1>
      <p className="phu">
        Kho đi ghi phiếu và trừ hàng khỏi lô tồn; hàng đang đi đường cho tới khi kho đến cân lại và nhận vào một khu. Kho đến có lô tồn mới mang cùng nguồn gốc lô mua, nên truy xuất vẫn đi được về tận nhà cung cấp. Chênh lệch giữa hai lần cân là hao hụt vận chuyển.
      </p>
      <div className="hang">
        <div>
          <label htmlFor="kho">Kho, xưởng</label>
          <select id="kho" value={khoId} onChange={(e) => { setKhoId(e.target.value); setF({ ...f, loTonId: '', denKhoId: '' }); }}>
            {kho.map((x) => <option key={x.id} value={x.id}>{x.name}{x.quyen.ghiPhieu ? ' (kho của tôi)' : ''}</option>)}
          </select>
        </div>
      </div>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {bao && <div className="dat" role="status">{bao}</div>}

      {k?.quyen.ghiPhieu && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={ghi}>
          <h2 style={{ marginTop: 0 }}>Phiếu chuyển kho</h2>
          <div className="hang">
            <div style={{ flexBasis: 380 }}>
              <label htmlFor="lt">Lô tồn</label>
              <select id="lt" required value={f.loTonId} onChange={(e) => setF({ ...f, loTonId: e.target.value, khoiLuongKg: String(loTon.find((x) => x.id === e.target.value)?.remainingKg ?? '') })}>
                <option value="">Chọn lô tồn</option>
                {loTon.map((x) => <option key={x.id} value={x.id}>{x.code} · khu {x.zoneCode} · {x.commodityName} {x.grade ?? LOAI_LO_TON[x.kind]} · còn {kg(x.remainingKg)}</option>)}
              </select>
            </div>
            <div style={{ flexBasis: 260 }}>
              <label htmlFor="den">Kho đến</label>
              <select id="den" required value={f.denKhoId} onChange={(e) => setF({ ...f, denKhoId: e.target.value })}>
                <option value="">Chọn kho đến</option>
                {den.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
          </div>
          {lt?.eudrClass && <p className="phu">Lô này {NHAN_EUDR[lt.eudrClass].toLowerCase()}: kho đến phải nhận vào khu {lt.eudrClass === 'du' ? 'đủ EUDR' : 'không phải khu đủ EUDR'}.</p>}
          <div className="hang">
            <div><label htmlFor="kg">Khối lượng chuyển (kg)</label><input id="kg" type="number" min="0" step="any" max={lt?.remainingKg} required value={f.khoiLuongKg} onChange={(e) => setF({ ...f, khoiLuongKg: e.target.value })} /></div>
            <div><label htmlFor="nc">Ngày chuyển</label><input id="nc" type="date" required max={homNay()} value={f.ngayChuyen} onChange={(e) => setF({ ...f, ngayChuyen: e.target.value })} /></div>
            <div><label htmlFor="xe">Biển số xe</label><input id="xe" value={f.bienSoXe} onChange={(e) => setF({ ...f, bienSoXe: e.target.value })} /></div>
            <div style={{ flexBasis: 280 }}><label htmlFor="gc">Ghi chú</label><input id="gc" value={f.ghiChu} onChange={(e) => setF({ ...f, ghiChu: e.target.value })} /></div>
            <button type="submit">Ghi phiếu chuyển</button>
          </div>
        </form>
      )}

      <h2>Phiếu chuyển đi và chuyển đến</h2>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Phiếu</th><th>Ngày chuyển</th><th>Từ → đến</th><th>Lô tồn</th><th className="so">Gửi</th><th className="so">Nhận</th><th className="so">Hao hụt</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {phieu.length === 0 && <tr><td colSpan={9} className="phu">Chưa có phiếu chuyển kho.</td></tr>}
            {phieu.map((p) => {
              const khoDen = kho.find((x) => x.id === p.toFacilityId);
              const khuHop = (khoDen?.khu ?? []).filter((z) => z.active && (p.eudrClass === 'du' ? z.kind === 'du_eudr' : z.kind !== 'du_eudr') && (p.sector !== 'thuy_san' || z.kind === 'kho_lanh'));
              return (
                <tr key={p.id} className={p.status === 'huy' ? 'huy' : ''}>
                  <td>{p.code}<div className="phu">{p.createdByName}{p.vehicleNo ? ` · xe ${p.vehicleNo}` : ''}</div>{p.cancelReason && <div className="phu">Huỷ: {p.cancelReason}</div>}</td>
                  <td>{ngay(p.sentOn)}</td>
                  <td>{p.fromName} → {p.toName}</td>
                  <td>
                    <Link href={`/kho/lo-ton/${p.stockLotId}`}>{p.lotCode}</Link> <span className="phu">{p.commodityName} {p.grade ?? ''}</span>
                    {p.receivedStockLotId && <div>→ <Link href={`/kho/lo-ton/${p.receivedStockLotId}`}>{p.receivedStockLotCode}</Link> <span className="phu">ngày {ngay(p.receivedOn!)}</span></div>}
                  </td>
                  <td className="so">{kg(p.quantityKg)}</td>
                  <td className="so">{kg(p.receivedKg)}</td>
                  <td className={`so ${p.lossKg !== null && p.lossKg > p.quantityKg * 0.005 ? 'canh-bao-nhe' : ''}`}>{kg(p.lossKg)}</td>
                  <td>{TRANG_THAI_CHUYEN[p.status]}</td>
                  <td>
                    {p.quyen.nhan && nhan?.id !== p.id && <button className="nho" onClick={() => setNhan({ id: p.id, khuId: khuHop[0]?.id ?? '', kg: String(p.quantityKg), ngay: homNay(), bao: '' })}>Cân và nhận</button>}
                    {p.quyen.huy && huy?.id !== p.id && <button className="phu-btn nho" onClick={() => setHuy({ id: p.id, lyDo: '' })}>Huỷ</button>}
                    {nhan?.id === p.id && (
                      <span className="hang" style={{ minWidth: 420 }}>
                        <select aria-label="Khu nhận" value={nhan.khuId} onChange={(e) => setNhan({ ...nhan, khuId: e.target.value })}>
                          {khuHop.map((z) => <option key={z.id} value={z.id}>Khu {z.code} · {z.name}</option>)}
                        </select>
                        <input aria-label="Khối lượng cân lại (kg)" type="number" min="0" step="any" style={{ width: 110 }} value={nhan.kg} onChange={(e) => setNhan({ ...nhan, kg: e.target.value })} />
                        <input aria-label="Ngày nhận" type="date" max={homNay()} value={nhan.ngay} onChange={(e) => setNhan({ ...nhan, ngay: e.target.value })} />
                        <input aria-label="Số bao" placeholder="Số bao" type="number" min="1" style={{ width: 80 }} value={nhan.bao} onChange={(e) => setNhan({ ...nhan, bao: e.target.value })} />
                        <button className="nho" onClick={() => xacNhan(p)}>Nhận</button>
                      </span>
                    )}
                    {huy?.id === p.id && (
                      <span className="hang" style={{ minWidth: 260 }}>
                        <input aria-label="Lý do huỷ" placeholder="Lý do huỷ" value={huy.lyDo} onChange={(e) => setHuy({ ...huy, lyDo: e.target.value })} />
                        <button className="nho" onClick={() => lam(() => api(`/kho/chuyen-kho/${p.id}/huy`, { body: { lyDo: huy.lyDo } }).then(() => setHuy(null)))}>Xác nhận</button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </KhungTrang>
  );
}
