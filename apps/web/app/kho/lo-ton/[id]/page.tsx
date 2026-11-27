'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { kg, Khu, LOAI_LO_TON, NguonGoc, NHAN_EUDR, phanTram, SO_KHO, TRANG_THAI_LO_TON } from '@/lib/kho';
import { LOAI_GIAO_DICH } from '@/lib/lo-hang';
import { ngay, ngayGio } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../../khung-trang';

interface ChiTiet {
  id: string;
  code: string;
  facilityName: string;
  zoneCode: string;
  zoneName: string;
  commodityName: string;
  kind: string;
  grade: string | null;
  dealType: string;
  eudrClass: string | null;
  initialKg: number;
  remainingKg: number;
  bags: number | null;
  source: string;
  parentId: string | null;
  status: string;
  receivedOn: string;
  nguonGoc: NguonGoc[];
  soKho: { id: number; at: string; kind: string; quantityKg: number; fromZoneCode: string | null; toZoneCode: string | null; note: string | null; actorName: string }[];
  khuKhac: Khu[];
  quyen: { chuyenKhu: boolean };
}
interface Buoc { level: number; kind: string; ref: string; label: string; detail: string; lots: string[] }

export default function LoTon() {
  const toi = useToi();
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<ChiTiet | null>(null);
  const [loi, setLoi] = useState('');
  const [f, setF] = useState({ khuId: '', khoiLuongKg: '' });
  const [buoc, setBuoc] = useState<Buoc[]>([]);

  const tai = useCallback(async () => {
    const [a, b] = await Promise.all([api<ChiTiet>(`/kho/lo-ton/${id}`), api<{ buoc: Buoc[] }>(`/kho/lo-ton/${id}/truy-xuat`)]);
    setD(a);
    setBuoc(b.buoc);
  }, [id]);
  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  async function chuyen(e: FormEvent) {
    e.preventDefault();
    setLoi('');
    try {
      const r = await api<{ id: string }>(`/kho/lo-ton/${id}/chuyen-khu`, { body: { khuId: f.khuId, khoiLuongKg: f.khoiLuongKg ? Number(f.khoiLuongKg) : null } });
      setF({ khuId: '', khoiLuongKg: '' });
      if (r.id !== id) window.location.href = `/kho/lo-ton/${r.id}`;
      else await tai();
    } catch (err) {
      setLoi((err as Error).message);
    }
  }

  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <p><Link href="/kho/nhan-hang">← Lô tồn và phiếu nhận hàng</Link></p>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {d && (
        <>
          <h1>Lô tồn {d.code}</h1>
          <p>
            {d.commodityName} · {LOAI_LO_TON[d.kind]}{d.grade ? ` · hạng ${d.grade}` : ''} · {LOAI_GIAO_DICH[d.dealType]}{' '}
            {d.eudrClass && <span className={`nhan ${d.eudrClass === 'du' ? 'nhan-eudr' : 'nhan-khong-eudr'}`}>{NHAN_EUDR[d.eudrClass]}</span>}
          </p>
          {d.status !== 'san_sang' && (
            <p className={d.status === 'cho_duyet' ? 'canh-bao-nhe' : 'phu'}>
              {TRANG_THAI_LO_TON[d.status]}.{d.status === 'cho_duyet' && ' Lô này chưa chuyển khu, chưa sơ chế tiếp, chưa xuất được cho tới khi Giám đốc duyệt.'}
            </p>
          )}
          <div className="luoi">
            <div className="o"><div className="phu">Đang ở</div><div className="so-lon">{d.zoneCode}</div><div className="phu">{d.zoneName}, {d.facilityName}</div></div>
            <div className="o"><div className="phu">Còn lại</div><div className="so-lon">{kg(d.remainingKg)}</div><div className="phu">ban đầu {kg(d.initialKg)}{d.bags ? ` · ${d.bags} bao` : ''}</div></div>
            <div className="o"><div className="phu">Ngày nhận</div><div className="so-lon">{ngay(d.receivedOn)}</div>{d.parentId && <div className="phu">{d.source === 'chuyen_kho' ? 'chuyển từ' : 'tách từ'} <Link href={`/kho/lo-ton/${d.parentId}`}>lô gốc</Link></div>}</div>
          </div>

          <h2>Nguồn gốc</h2>
          <p className="phu">Lô tồn mang đúng tỷ lệ các lô mua đã vào nó. Truy xuất và gói EUDR của lô xuất đọc theo tỷ lệ này.</p>
          <div className="bang-cuon">
            <table>
              <thead><tr><th>Lô mua</th><th>Nhà cung cấp</th><th className="so">Tỷ lệ</th><th className="so">Tương ứng còn lại</th></tr></thead>
              <tbody>
                {d.nguonGoc.map((o) => (
                  <tr key={o.purchaseLotId}><td>{o.code}</td><td>{o.supplierName}</td><td className="so">{phanTram(o.share)}</td><td className="so">{kg(d.remainingKg * o.share)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          {buoc.length > 0 && (
            <>
              <h2>Đường đi của hàng</h2>
              <p className="phu">Lần ngược từ lô này về phiếu nhận hàng và lô mua, qua các lệnh sơ chế, các lần tách lô và chuyển kho.</p>
              <ol className="chuoi">
                {buoc.map((b, i) => (
                  <li key={`${b.ref}-${i}`} style={{ marginLeft: b.level * 20 }}>
                    <strong>{b.label}</strong> <span className="phu">{b.ref}</span>
                    <div>{b.detail}</div>
                    <div className="phu">{b.kind === 'nhan_hang' ? 'Lô mua: ' : 'Từ: '}{b.lots.join(', ')}</div>
                  </li>
                ))}
              </ol>
            </>
          )}

          {d.quyen.chuyenKhu && (
            <form className="o" style={{ marginTop: 16 }} onSubmit={chuyen}>
              <h2 style={{ marginTop: 0 }}>Chuyển khu</h2>
              <p className="phu">Để trống khối lượng để chuyển cả lô. Chuyển một phần thì phần đó thành lô tồn mới, cùng nguồn gốc.</p>
              <div className="hang">
                <div>
                  <label htmlFor="khu">Đến khu</label>
                  <select id="khu" required value={f.khuId} onChange={(e) => setF({ ...f, khuId: e.target.value })}>
                    <option value="">Chọn khu</option>
                    {d.khuKhac.map((z) => <option key={z.id} value={z.id}>{z.code} · {z.kindLabel}</option>)}
                  </select>
                </div>
                <div><label htmlFor="kl">Khối lượng (kg)</label><input id="kl" type="number" min="0" step="any" value={f.khoiLuongKg} onChange={(e) => setF({ ...f, khoiLuongKg: e.target.value })} placeholder={`tối đa ${d.remainingKg}`} /></div>
                <button type="submit">Chuyển</button>
              </div>
            </form>
          )}

          <h2>Sổ kho</h2>
          <div className="bang-cuon">
            <table>
              <thead><tr><th>Lúc</th><th>Việc</th><th className="so">Khối lượng</th><th>Khu</th><th>Ghi chú</th><th>Người làm</th></tr></thead>
              <tbody>
                {d.soKho.map((m) => (
                  <tr key={m.id}>
                    <td>{ngayGio(m.at)}</td>
                    <td>{SO_KHO[m.kind] ?? m.kind}</td>
                    <td className="so">{m.quantityKg > 0 ? '+' : ''}{kg(m.quantityKg)}</td>
                    <td>{[m.fromZoneCode, m.toZoneCode].filter(Boolean).join(' → ') || '—'}</td>
                    <td>{m.note ?? ''}</td>
                    <td>{m.actorName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </KhungTrang>
  );
}
