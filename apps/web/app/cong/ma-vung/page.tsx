'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { MaSoVung } from '@/lib/ma-vung';
import { HoSoNguonCung } from '@/lib/nguon-cung';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

/** Cổng nhà cung cấp: gửi mã số vùng trồng / mã cơ sở nuôi kèm bản scan để Vạn Thuận đối chiếu. */
export default function MaSoVungCuaToi() {
  const toi = useToi();
  const [d, setD] = useState<HoSoNguonCung | null>(null);
  const [loi, setLoi] = useState('');
  useEffect(() => {
    if (toi) api<HoSoNguonCung>('/cong/nguon-cung').then(setD).catch((e: Error) => setLoi(e.message));
  }, [toi]);
  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <h1>Mã số vùng trồng, mã cơ sở nuôi</h1>
      <p className="phu">Gửi mã do cơ quan nhà nước cấp kèm bản scan giấy chứng nhận. Vạn Thuận đối chiếu mã với giấy rồi duyệt; hàng đi Trung Quốc và thủy sản đi EU cần mã đã duyệt còn hiệu lực.</p>
      {loi && <div className="loi">{loi}</div>}
      {d && (d.vung.length ? <MaSoVung gon duong="/cong/ma-vung" duongGui="/cong/ma-vung" duongTep={(x) => `/cong/ma-vung/${x}/tep`} vung={d.vung.filter((v) => v.active)} /> : <p className="phu">Quý công ty chưa có vùng nào. Nhờ nhân viên thu mua Vạn Thuận tạo vùng trước.</p>)}
    </KhungTrang>
  );
}
