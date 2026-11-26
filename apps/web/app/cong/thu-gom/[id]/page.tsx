'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PhieuThuGomLo } from '@/lib/thu-gom';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../../khung-trang';

export default function PhieuThuGomCong() {
  const toi = useToi();
  const { id } = useParams<{ id: string }>();
  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <p><Link href="/cong/thu-gom">← Thu gom</Link></p>
      <PhieuThuGomLo duong={`/cong/thu-gom/${id}`} duongHuy={(p) => `/cong/thu-gom/phieu/${p}/huy`} />
      <p className="phu" style={{ marginTop: 12 }}>Chưa thấy hộ hoặc thửa? Thêm ở trang <Link href="/cong/vung-trong">Vùng trồng</Link>.</p>
    </KhungTrang>
  );
}
