'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { NhanKyc } from '@/lib/doi-tac';
import { ha } from '@/lib/nguon-cung';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../khung-trang';

interface Dong { id: string; code: string; name: string; kycStatus: string; soHo: number; soVung: number; soThua: number; soDaGiac: number; dienTichHa: number; soCanhBao: number }

export default function NguonCung() {
  const toi = useToi();
  const [ds, setDs] = useState<Dong[] | null>(null);
  const [loi, setLoi] = useState('');
  useEffect(() => {
    if (toi) api<{ nhaCungCap: Dong[] }>('/nguon-cung').then((r) => setDs(r.nhaCungCap)).catch((e: Error) => setLoi(e.message));
  }, [toi]);
  if (!toi) return null;
  const tong = (ds ?? []).reduce((a, d) => ({ ho: a.ho + d.soHo, thua: a.thua + d.soThua, ha: a.ha + d.dienTichHa, cb: a.cb + d.soCanhBao }), { ho: 0, thua: 0, ha: 0, cb: 0 });
  return (
    <KhungTrang toi={toi}>
      <h1>Nguồn cung</h1>
      <p className="phu">Nông hộ, vùng trồng và thửa có tọa độ của từng nhà cung cấp. Đây là gốc để truy xuất nguồn gốc và lập hồ sơ EUDR cho cà phê xuất sang EU. Trần sản lượng của thửa tính theo <Link href="/nguon-cung/nang-suat">năng suất tối đa</Link>.</p>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {ds && (
        <div className="luoi" style={{ margin: '12px 0' }}>
          <div className="o"><div className="phu">Nông hộ</div><div className="so-lon">{tong.ho}</div></div>
          <div className="o"><div className="phu">Thửa có tọa độ</div><div className="so-lon">{tong.thua}</div></div>
          <div className="o"><div className="phu">Tổng diện tích</div><div className="so-lon">{ha(tong.ha)}</div></div>
          <div className="o"><div className="phu">Thửa có cảnh báo</div><div className={`so-lon${tong.cb ? ' canh-bao-nhe' : ''}`}>{tong.cb}</div></div>
        </div>
      )}
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Nhà cung cấp</th><th>Thẩm định</th><th>Vùng</th><th>Hộ</th><th>Thửa</th><th>Có ranh giới</th><th>Diện tích</th><th>Cảnh báo</th></tr></thead>
          <tbody>
            {ds?.map((d) => (
              <tr key={d.id}>
                <td><Link href={`/nguon-cung/${d.id}`}>{d.name}</Link><div className="phu">{d.code}</div></td>
                <td><NhanKyc s={d.kycStatus} /></td>
                <td>{d.soVung}</td>
                <td>{d.soHo}</td>
                <td>{d.soThua}</td>
                <td>{d.soDaGiac}</td>
                <td>{ha(d.dienTichHa)}</td>
                <td className={d.soCanhBao ? 'canh-bao-nhe' : 'phu'}>{d.soCanhBao || '—'}</td>
              </tr>
            ))}
            {ds?.length === 0 && <tr><td colSpan={8} className="phu">Chưa có nhà cung cấp nào. Thêm đối tác có vai nhà cung cấp ở trang Đối tác.</td></tr>}
          </tbody>
        </table>
      </div>
    </KhungTrang>
  );
}
