'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { kg, TRANG_THAI_LO_MUA } from '@/lib/lo-hang';
import { NhanEudr } from '@/lib/thu-gom';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface LoMuaCuaToi { id: string; code: string; status: string; collectedKg: number; eudrClass: string | null; commodityName: string; sector: string }

/** Cổng nhà cung cấp: các lô mua của quý công ty, để ghi phiếu thu gom theo hộ và thửa. */
export default function ThuGomCuaToi() {
  const toi = useToi();
  const [ds, setDs] = useState<LoMuaCuaToi[] | null>(null);
  const [loi, setLoi] = useState('');
  useEffect(() => {
    if (toi) api<{ lo: LoMuaCuaToi[] }>('/cong/thu-gom').then((r) => setDs(r.lo)).catch((e: Error) => setLoi(e.message));
  }, [toi]);
  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <h1>Thu gom</h1>
      <p className="phu">Mỗi lần cân hàng của một hộ, ghi một phiếu: hộ nào, thửa nào, bao nhiêu kg. Đây là căn cứ truy xuất nguồn gốc. Với cà phê, chỉ hàng ghi bằng phiếu từ thửa đã đánh dấu mới đi được thị trường EU.</p>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {ds && ds.length === 0 && <p className="phu">Chưa có lô mua nào. Lô mua do nhân viên Vạn Thuận lập theo hợp đồng.</p>}
      <div className="luoi">
        {ds?.map((l) => (
          <Link key={l.id} href={`/cong/thu-gom/${l.id}`} className="o the-lo">
            <strong>{l.code}</strong> <span className="nhan">{TRANG_THAI_LO_MUA[l.status]}</span>
            <div>{l.commodityName}</div>
            <div className="phu">Đã thu gom {kg(l.collectedKg)}</div>
            {l.sector === 'ca_phe' && <div style={{ marginTop: 6 }}><NhanEudr eudrClass={l.eudrClass} /></div>}
          </Link>
        ))}
      </div>
    </KhungTrang>
  );
}
