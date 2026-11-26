'use client';

import { NhatKyThuoc } from '@/lib/nhat-ky-thuoc';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

/** Cổng nhà cung cấp: nhật ký dùng thuốc BVTV cho thửa gia vị. */
export default function NhatKyThuocCuaToi() {
  const toi = useToi();
  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <h1>Nhật ký thuốc BVTV</h1>
      <p className="phu">Chỉ áp dụng cho thửa gia vị. Nếu quý công ty chưa có thửa gia vị, trang này để trống.</p>
      <NhatKyThuoc duong="/cong/nhat-ky-thuoc" duongGhi="/cong/nhat-ky-thuoc" duongHuy={(id) => `/cong/nhat-ky-thuoc/${id}/huy`} />
    </KhungTrang>
  );
}
