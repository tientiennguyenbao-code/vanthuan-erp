'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BaoGia } from '@/lib/bao-gia';
import { ngay, tien } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

type Dong = BaoGia & { usdMoiKg: number | null; doiTacDat: boolean };

export default function SoSanhBaoGia() {
  const toi = useToi();
  const [matHang, setMatHang] = useState<{ id: string; name: string }[]>([]);
  const [mh, setMh] = useState('');
  const [ds, setDs] = useState<Dong[] | null>(null);
  const [loi, setLoi] = useState('');

  useEffect(() => {
    if (toi) api<{ matHang: { id: string; name: string }[] }>('/danh-muc/mat-hang').then((r) => setMatHang(r.matHang)).catch((e: Error) => setLoi(e.message));
  }, [toi]);

  useEffect(() => {
    if (!mh) return;
    api<{ baoGia: Dong[] }>(`/bao-gia/so-sanh?matHangId=${mh}`).then((r) => setDs(r.baoGia)).catch((e: Error) => setLoi(e.message));
  }, [mh]);

  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <p><Link href="/bao-gia">← Báo giá</Link></p>
      <h1>So sánh báo giá mua</h1>
      <p className="phu">Các báo giá mua còn hiệu lực của một mặt hàng, quy về USD mỗi kg, rẻ nhất lên đầu.</p>
      <div style={{ maxWidth: 360 }}>
        <label htmlFor="mh">Mặt hàng</label>
        <select id="mh" value={mh} onChange={(e) => setMh(e.target.value)}>
          <option value="">Chọn…</option>
          {matHang.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {ds && (
        <div className="bang-cuon" style={{ marginTop: 16 }}>
          <table>
            <thead><tr><th>Nhà cung cấp</th><th>USD/kg</th><th>Đơn giá gốc</th><th>Số lượng</th><th>Quy cách</th><th>Chứng nhận</th><th>Giao</th><th>Hiệu lực đến</th></tr></thead>
            <tbody>
              {ds.map((q, i) => (
                <tr key={q.id}>
                  <td><Link href={`/bao-gia/${q.id}`}>{q.partnerName}</Link>{i === 0 && <div className="kyc-dat">Rẻ nhất</div>}{!q.doiTacDat && <div className="kyc-canh-bao">Chưa thẩm định đạt</div>}</td>
                  <td><strong>{q.usdMoiKg === null ? 'Thiếu tỷ giá' : q.usdMoiKg.toLocaleString('vi-VN', { maximumFractionDigits: 3 })}</strong></td>
                  <td>{tien(q.unitPrice, q.currency)} / {q.unit === 'tan' ? 'tấn' : 'kg'}</td>
                  <td>{tien(q.quantity)} {q.unit === 'tan' ? 'tấn' : 'kg'}</td>
                  <td>{q.spec ?? '—'}</td>
                  <td>{q.certifications ?? '—'}</td>
                  <td>{q.deliveryTime ?? '—'}</td>
                  <td>{ngay(q.validUntil)}</td>
                </tr>
              ))}
              {ds.length === 0 && <tr><td colSpan={8} className="phu">Chưa có báo giá mua còn hiệu lực cho mặt hàng này.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </KhungTrang>
  );
}
