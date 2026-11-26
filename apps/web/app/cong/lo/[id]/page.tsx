'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChungTuCong } from '@/lib/cong-chung-tu';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../../khung-trang';

export default function LoTrenCong() {
  const toi = useToi();
  const { id } = useParams<{ id: string }>();
  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <p><Link href="/cong">← Lô hàng của quý công ty</Link></p>
      <ChungTuCong loId={id} />
    </KhungTrang>
  );
}
