'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ChenhLech, Kho, kg, LOAI_KHU, LOAI_LO_TON, NguonGoc, NHAN_EUDR, phanTram } from '@/lib/kho';
import { ngay } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface LoMua {
  id: string;
  code: string;
  status: string;
  eudrClass: string | null;
  collectedKg: number;
  receivedKg: number;
  supplierName: string;
  commodityName: string;
  sector: string;
  chenhLech: ChenhLech;
}
interface LoTon {
  id: string;
  code: string;
  zoneCode: string;
  zoneName: string;
  commodityName: string;
  kind: string;
  grade: string | null;
  eudrClass: string | null;
  initialKg: number;
  remainingKg: number;
  bags: number | null;
  receivedOn: string;
  nguonGoc: NguonGoc[];
}
interface Phieu {
  id: string;
  code: string;
  lotCode: string;
  zoneCode: string;
  stockLotCode: string;
  stockLotId: string;
  receivedOn: string;
  vehicleNo: string | null;
  weighTicketNo: string | null;
  quantityKg: number;
  bags: number | null;
  moisturePct: number | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdByName: string;
  quyen: { huy: boolean };
}

const homNay = () => new Date().toISOString().slice(0, 10);

export default function NhanHang() {
  const toi = useToi();
  const [kho, setKho] = useState<Kho[]>([]);
  const [loMua, setLoMua] = useState<LoMua[]>([]);
  const [khoId, setKhoId] = useState('');
  const [loTon, setLoTon] = useState<LoTon[]>([]);
  const [phieu, setPhieu] = useState<Phieu[]>([]);
  const [loi, setLoi] = useState('');
  const [bao, setBao] = useState('');
  const [f, setF] = useState({ loMuaId: '', khuId: '', ngayNhan: homNay(), bienSoXe: '', soPhieuCan: '', khoiLuongKg: '', soBao: '', doAmPhanTram: '', ghiChu: '' });
  const [huy, setHuy] = useState<{ id: string; lyDo: string } | null>(null);

  const tai = useCallback(async (id: string) => {
    const [a, b] = await Promise.all([
      api<{ loTon: LoTon[] }>(`/kho/lo-ton?khoId=${id}&conHang=1`),
      api<{ phieu: Phieu[] }>(`/kho/nhan-hang?khoId=${id}`),
    ]);
    setLoTon(a.loTon);
    setPhieu(b.phieu);
  }, []);
  useEffect(() => {
    if (!toi) return;
    Promise.all([api<{ kho: Kho[] }>('/kho'), api<{ loMua: LoMua[] }>('/kho/lo-mua')])
      .then(([a, b]) => {
        setKho(a.kho);
        setLoMua(b.loMua);
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
      setLoMua((await api<{ loMua: LoMua[] }>('/kho/lo-mua')).loMua);
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  if (!toi) return null;
  const k = kho.find((x) => x.id === khoId);
  const lm = loMua.find((x) => x.id === f.loMuaId);
  const so = (v: string) => (v ? Number(v) : null);
  async function ghi(e: FormEvent) {
    e.preventDefault();
    await lam(async () => {
      const r = await api<{ code: string; stockLotCode: string; chenhLech: ChenhLech }>('/kho/nhan-hang', {
        body: { loMuaId: f.loMuaId, khoId, khuId: f.khuId, ngayNhan: f.ngayNhan, bienSoXe: f.bienSoXe, soPhieuCan: f.soPhieuCan, khoiLuongKg: Number(f.khoiLuongKg), soBao: so(f.soBao), doAmPhanTram: so(f.doAmPhanTram), ghiChu: f.ghiChu },
      });
      setF({ ...f, bienSoXe: '', soPhieuCan: '', khoiLuongKg: '', soBao: '', doAmPhanTram: '', ghiChu: '' });
      setBao(`Đã ghi ${r.code}, hàng vào lô tồn ${r.stockLotCode}.${r.chenhLech.warning ? ` Lưu ý: ${r.chenhLech.warning}.` : ''}`);
    });
  }
  return (
    <KhungTrang toi={toi}>
      <p><Link href="/kho">← Kho và tồn kho</Link></p>
      <h1>Nhận hàng và lô tồn</h1>
      <div className="hang">
        <div>
          <label htmlFor="kho">Kho, xưởng</label>
          <select id="kho" value={khoId} onChange={(e) => { setKhoId(e.target.value); setF({ ...f, khuId: '' }); }}>
            {kho.map((x) => <option key={x.id} value={x.id}>{x.name}{x.quyen.ghiPhieu ? ' (kho của tôi)' : ''}</option>)}
          </select>
        </div>
      </div>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {bao && <div className="dat" role="status">{bao}</div>}

      {k?.quyen.ghiPhieu && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={ghi}>
          <h2 style={{ marginTop: 0 }}>Phiếu nhận hàng</h2>
          <p className="phu">Mỗi chuyến xe một phiếu, ghi khối lượng cân tại kho. Hàng của phiếu thành một lô tồn nguyên liệu.</p>
          <div className="hang">
            <div style={{ flexBasis: 320 }}>
              <label htmlFor="lm">Lô mua</label>
              <select id="lm" required value={f.loMuaId} onChange={(e) => setF({ ...f, loMuaId: e.target.value })}>
                <option value="">Chọn lô mua</option>
                {loMua.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.commodityName} · {x.supplierName}{x.eudrClass ? ` · ${NHAN_EUDR[x.eudrClass]}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="khu">Khu</label>
              <select id="khu" required value={f.khuId} onChange={(e) => setF({ ...f, khuId: e.target.value })}>
                <option value="">Chọn khu</option>
                {k.khu.filter((z) => z.active).map((z) => <option key={z.id} value={z.id}>{z.code} · {LOAI_KHU[z.kind]}</option>)}
              </select>
            </div>
            <div><label htmlFor="ng">Ngày nhận</label><input id="ng" type="date" required max={homNay()} value={f.ngayNhan} onChange={(e) => setF({ ...f, ngayNhan: e.target.value })} /></div>
          </div>
          {lm && (
            <p className={lm.chenhLech.warning ? 'canh-bao-nhe' : 'phu'}>
              Lô {lm.code}: thu gom {kg(lm.collectedKg)}, đã nhận vào kho {kg(lm.receivedKg)}.{lm.chenhLech.warning ? ` ${lm.chenhLech.warning}.` : ''}
              {lm.eudrClass === 'du' && ' Cà phê đủ EUDR: chỉ nhận vào khu đủ EUDR.'}
              {lm.sector === 'thuy_san' && ' Thủy sản: chỉ nhận vào kho lạnh.'}
            </p>
          )}
          <div className="hang">
            <div><label htmlFor="xe">Biển số xe</label><input id="xe" value={f.bienSoXe} onChange={(e) => setF({ ...f, bienSoXe: e.target.value })} placeholder="47C-123.45" /></div>
            <div><label htmlFor="pc">Số phiếu cân</label><input id="pc" value={f.soPhieuCan} onChange={(e) => setF({ ...f, soPhieuCan: e.target.value })} /></div>
            <div><label htmlFor="kl">Khối lượng (kg)</label><input id="kl" type="number" min="0" step="any" required value={f.khoiLuongKg} onChange={(e) => setF({ ...f, khoiLuongKg: e.target.value })} /></div>
            <div><label htmlFor="sb">Số bao</label><input id="sb" type="number" min="0" step="1" value={f.soBao} onChange={(e) => setF({ ...f, soBao: e.target.value })} /></div>
            <div><label htmlFor="da">Độ ẩm (%)</label><input id="da" type="number" min="0" max="100" step="any" value={f.doAmPhanTram} onChange={(e) => setF({ ...f, doAmPhanTram: e.target.value })} /></div>
          </div>
          <div className="hang">
            <div style={{ flexBasis: 400 }}><label htmlFor="gc">Ghi chú</label><input id="gc" value={f.ghiChu} onChange={(e) => setF({ ...f, ghiChu: e.target.value })} /></div>
            <button type="submit">Ghi phiếu</button>
          </div>
        </form>
      )}

      <h2>Lô tồn còn hàng</h2>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Lô tồn</th><th>Khu</th><th>Mặt hàng</th><th>Loại, hạng</th><th>EUDR</th><th className="so">Còn lại</th><th>Từ lô mua</th><th>Ngày nhận</th></tr></thead>
          <tbody>
            {loTon.length === 0 && <tr><td colSpan={8} className="phu">Kho này chưa có hàng.</td></tr>}
            {loTon.map((x) => (
              <tr key={x.id}>
                <td><Link href={`/kho/lo-ton/${x.id}`}>{x.code}</Link></td>
                <td>{x.zoneCode}</td>
                <td>{x.commodityName}</td>
                <td>{LOAI_LO_TON[x.kind]}{x.grade ? ` · ${x.grade}` : ''}</td>
                <td>{x.eudrClass ? <span className={`nhan ${x.eudrClass === 'du' ? 'nhan-eudr' : 'nhan-khong-eudr'}`}>{NHAN_EUDR[x.eudrClass]}</span> : '—'}</td>
                <td className="so">{kg(x.remainingKg)}{x.remainingKg !== x.initialKg && <div className="phu">ban đầu {kg(x.initialKg)}</div>}</td>
                <td>{x.nguonGoc.map((o) => <div key={o.purchaseLotId}>{o.code} <span className="phu">{phanTram(o.share)}</span></div>)}</td>
                <td>{ngay(x.receivedOn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Phiếu nhận hàng</h2>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Phiếu</th><th>Ngày</th><th>Lô mua</th><th>Khu</th><th>Xe, phiếu cân</th><th className="so">Khối lượng</th><th className="so">Bao</th><th className="so">Độ ẩm</th><th>Lô tồn</th><th>Người ghi</th><th></th></tr></thead>
          <tbody>
            {phieu.length === 0 && <tr><td colSpan={11} className="phu">Chưa có phiếu.</td></tr>}
            {phieu.map((p) => (
              <tr key={p.id} className={p.voidedAt ? 'huy' : ''}>
                <td>{p.code}{p.voidReason && <div className="phu">Huỷ: {p.voidReason}</div>}</td>
                <td>{ngay(p.receivedOn)}</td>
                <td>{p.lotCode}</td>
                <td>{p.zoneCode}</td>
                <td>{[p.vehicleNo, p.weighTicketNo].filter(Boolean).join(' · ') || '—'}</td>
                <td className="so">{kg(p.quantityKg)}</td>
                <td className="so">{p.bags ?? '—'}</td>
                <td className="so">{p.moisturePct === null ? '—' : `${p.moisturePct}%`}</td>
                <td><Link href={`/kho/lo-ton/${p.stockLotId}`}>{p.stockLotCode}</Link></td>
                <td>{p.createdByName}</td>
                <td>
                  {p.quyen.huy && huy?.id !== p.id && <button className="phu-btn nho" onClick={() => setHuy({ id: p.id, lyDo: '' })}>Huỷ</button>}
                  {huy?.id === p.id && (
                    <span className="hang" style={{ minWidth: 260 }}>
                      <input aria-label="Lý do huỷ" placeholder="Lý do huỷ" value={huy.lyDo} onChange={(e) => setHuy({ ...huy, lyDo: e.target.value })} />
                      <button className="nho" onClick={() => lam(() => api(`/kho/nhan-hang/${p.id}/huy`, { body: { lyDo: huy.lyDo } }).then(() => setHuy(null)))}>Xác nhận</button>
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
