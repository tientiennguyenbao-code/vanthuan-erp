'use client';

import { UocTinhThua } from '@/lib/uoc-tinh';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

/** Cổng nhà cung cấp: khai sản lượng dự kiến của từng thửa theo tháng thu hoạch. */
export default function UocTinhCuaToi() {
  const toi = useToi();
  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <h1>Sản lượng dự kiến</h1>
      <p className="phu">Quý công ty khai số kg dự kiến thu hoạch của từng thửa theo tháng. Vạn Thuận dùng số này để lên kế hoạch mua và chào bán, nhân viên thu mua có thể chỉnh lại sau khi đi kiểm vườn.</p>
      <UocTinhThua duongDoc="/cong/uoc-tinh" duongGhi="/cong/uoc-tinh" />
    </KhungTrang>
  );
}
