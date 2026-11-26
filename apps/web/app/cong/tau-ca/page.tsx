'use client';

import { TauCa } from '@/lib/tau-ca';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

/** Cổng nhà cung cấp: tàu cá và chuyến khai thác (thủy sản khai thác tự nhiên). */
export default function TauCaCuaToi() {
  const toi = useToi();
  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <h1>Tàu cá và chuyến khai thác</h1>
      <p className="phu">Chỉ dùng khi quý công ty bán thủy sản khai thác tự nhiên. Hàng nuôi ghi theo ao ở mục Vùng trồng.</p>
      <TauCa moSan duong="/cong/tau-ca" goc="/cong/tau-ca" />
    </KhungTrang>
  );
}
