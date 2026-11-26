'use client';

import { MaSoVung } from '@/lib/ma-vung';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

/** Người duyệt: mọi mã số vùng đang chờ đối chiếu, của mọi nhà cung cấp. */
export default function MaVungChoDuyet() {
  const toi = useToi();
  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <h1>Duyệt mã số vùng</h1>
      <p className="phu">
        Mở bản scan giấy chứng nhận, so số mã, nơi cấp và hạn hiệu lực với dòng đã gửi, rồi duyệt hoặc từ chối. Người gửi không tự duyệt.
        Mã đã duyệt mới được tính khi truy xuất lô xuất; giấy hết hạn thì mã thôi được tính.
      </p>
      <MaSoVung gon duong="/ma-vung?trangThai=cho_duyet" duongGui="/ma-vung" duongTep={(x) => `/ma-vung/${x}/tep`} vung={null} />
    </KhungTrang>
  );
}
