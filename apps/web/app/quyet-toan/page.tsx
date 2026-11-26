'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { LOAI_GIAO_DICH } from '@/lib/lo-hang';
import { ngayGio, tien } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../khung-trang';

interface Ban {
  id: string;
  exportLotId: string;
  lotCode: string;
  dealType: string;
  status: string;
  trangThai: string;
  marginUsd: number;
  marginPct: number | null;
  estimateMarginPct: number | null;
  needsDirector: boolean;
  directorReason: string | null;
  preparedByName: string;
  preparedAt: string;
  quyen: { duyet: boolean };
}

const LOC: Record<string, string> = { '': 'Tất cả', cho_ktt: 'Chờ Kế toán trưởng', cho_gd: 'Chờ Giám đốc', da_duyet: 'Đã duyệt', tra_lai: 'Bị trả lại' };

/** Danh sách quyết toán lô: hàng chờ duyệt của Kế toán trưởng và Giám đốc. */
export default function DanhSachQuyetToan() {
  const toi = useToi();
  const [loc, setLoc] = useState('');
  const [ds, setDs] = useState<Ban[] | null>(null);
  const [loi, setLoi] = useState('');
  const tai = useCallback(async () => setDs((await api<{ quyetToan: Ban[] }>(`/quyet-toan${loc ? `?trangThai=${loc}` : ''}`)).quyetToan), [loc]);
  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);
  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <h1>Quyết toán lô</h1>
      <p className="phu">Kế toán lập quyết toán ở trang lô khi đủ 6 điều kiện. Kế toán trưởng duyệt; Giám đốc duyệt thêm khi lô lỗ hoặc biên thấp hơn dự toán quá 10%. Mở lô để xem chi tiết và duyệt.</p>
      <div className="hang" style={{ maxWidth: 360 }}>
        <div>
          <label htmlFor="loc">Trạng thái</label>
          <select id="loc" value={loc} onChange={(e) => setLoc(e.target.value)}>{Object.entries(LOC).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        </div>
      </div>
      {loi && <div className="loi" role="alert">{loi}</div>}
      <div className="bang-cuon" style={{ marginTop: 12 }}>
        <table>
          <thead><tr><th>Lô</th><th>Trạng thái</th><th>Biên</th><th>Dự toán</th><th>Lập</th></tr></thead>
          <tbody>
            {ds?.length === 0 && <tr><td colSpan={5} className="phu">Không có quyết toán nào.</td></tr>}
            {ds?.map((b) => (
              <tr key={b.id}>
                <td><Link href={`/lo-hang/${b.exportLotId}`}>{b.lotCode}</Link><div className="phu">{LOAI_GIAO_DICH[b.dealType]}</div></td>
                <td>{b.trangThai}{b.quyen.duyet && <div className="kyc-canh-bao">Chờ bạn duyệt</div>}{b.needsDirector && <div className="phu">{b.directorReason}</div>}</td>
                <td className={b.marginUsd < 0 ? 'kyc-canh-bao' : ''}>{tien(b.marginUsd, 'USD')}{b.marginPct !== null && ` (${b.marginPct}%)`}</td>
                <td>{b.estimateMarginPct === null ? '—' : `${b.estimateMarginPct}%`}</td>
                <td>{b.preparedByName}<div className="phu">{ngayGio(b.preparedAt)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </KhungTrang>
  );
}
