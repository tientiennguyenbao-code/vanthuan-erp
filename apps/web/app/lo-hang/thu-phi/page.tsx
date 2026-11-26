'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { kg } from '@/lib/lo-hang';
import { XuatMisa } from '@/lib/misa';
import { ngay, tien } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface DeNghi {
  id: string;
  exportLotId: string;
  lotCode: string;
  purchaseLotId: string;
  purchaseLotCode: string;
  supplierName: string;
  feeContractId: string;
  feeContractCode: string;
  quantityKg: number;
  unitPricePerKg: number;
  currency: string;
  baseValue: number;
  ratePct: number | null;
  amount: number | null;
  amountUsd: number | null;
  blNumber: string;
  blDate: string;
  status: string;
  approvedByName: string | null;
  misaExportCode: string | null;
  coTheDuyet: boolean;
}

const TRANG_THAI: Record<string, string> = { cho_duyet: 'Chờ Kế toán trưởng duyệt', da_duyet: 'Đã duyệt, chờ thu', thieu_ty_le: 'Hợp đồng chưa có tỷ lệ phí' };

function DeNghiThuPhi() {
  const toi = useToi();
  const params = useSearchParams();
  const loXuatId = params.get('loXuatId') ?? '';
  const [ds, setDs] = useState<DeNghi[]>([]);
  const [trangThai, setTrangThai] = useState('');
  const [loi, setLoi] = useState('');
  const [thongBao, setThongBao] = useState('');

  const tai = useCallback(async () => {
    const p = new URLSearchParams();
    if (trangThai) p.set('trangThai', trangThai);
    if (loXuatId) p.set('loXuatId', loXuatId);
    setDs((await api<{ deNghi: DeNghi[] }>(`/de-nghi-thu-phi?${p.toString()}`)).deNghi);
  }, [trangThai, loXuatId]);

  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  async function duyet(d: DeNghi) {
    setLoi('');
    setThongBao('');
    try {
      await api(`/de-nghi-thu-phi/${d.id}/duyet`, { method: 'POST' });
      await tai();
      setThongBao(`Đã duyệt đề nghị thu ${tien(d.amount, d.currency)} của ${d.supplierName}.`);
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  if (!toi) return null;
  const tongUsd = ds.reduce((a, d) => a + (d.amountUsd ?? 0), 0);

  return (
    <KhungTrang toi={toi}>
      <p><Link href="/lo-hang">← Bảng điều phối</Link></p>
      <h1>Đề nghị thu phí</h1>
      <p className="phu">
        Phần mềm tự lập khi lô xếp tàu: mỗi lô mua trong lô xuất một đề nghị, phí = khối lượng thực giao × đơn giá bán × tỷ lệ phí của hợp đồng với nhà cung cấp. Kế toán trưởng duyệt trước khi thu.
      </p>
      {loXuatId && <p>Đang xem một lô. <Link href="/lo-hang/thu-phi">Xem tất cả</Link></p>}
      <div className="hang" style={{ maxWidth: 360 }}>
        <div>
          <label htmlFor="tt">Tình trạng</label>
          <select id="tt" value={trangThai} onChange={(e) => setTrangThai(e.target.value)}>
            <option value="">Tất cả</option>
            {Object.entries(TRANG_THAI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      {toi.quyen.includes('KE_TOAN_XUAT_MISA') && <XuatMisa sauKhiXuat={() => tai().catch((e: Error) => setLoi(e.message))} />}
      {thongBao && <div className="dat" role="status">{thongBao}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}
      <div className="bang-cuon" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Lô xuất, vận đơn</th><th>Nhà cung cấp, lô mua</th><th>Khối lượng</th><th>Giá trị tính phí</th><th>Tỷ lệ</th><th>Phí</th><th>Tình trạng</th><th></th></tr></thead>
          <tbody>
            {ds.length === 0 && <tr><td colSpan={8} className="phu">Chưa có đề nghị nào.</td></tr>}
            {ds.map((d) => (
              <tr key={d.id}>
                <td><Link href={`/lo-hang/${d.exportLotId}`}>{d.lotCode}</Link><div className="phu">{d.blNumber} · {ngay(d.blDate)}</div></td>
                <td>{d.supplierName}<div className="phu"><Link href={`/lo-hang/lo-mua/${d.purchaseLotId}`}>{d.purchaseLotCode}</Link> · HĐ <Link href={`/hop-dong/${d.feeContractId}`}>{d.feeContractCode}</Link></div></td>
                <td>{kg(d.quantityKg)}</td>
                <td>{tien(d.baseValue, d.currency)}<div className="phu">{tien(d.unitPricePerKg, d.currency)}/kg</div></td>
                <td>{d.ratePct === null ? '—' : `${d.ratePct}%`}</td>
                <td><strong>{tien(d.amount, d.currency)}</strong>{d.currency !== 'USD' && d.amountUsd !== null && <div className="phu">≈ {tien(d.amountUsd, 'USD')}</div>}</td>
                <td className={d.status === 'thieu_ty_le' ? 'kyc-canh-bao' : d.status === 'da_duyet' ? 'kyc-dat' : ''}>
                  {TRANG_THAI[d.status] ?? d.status}
                  {d.approvedByName && <div className="phu">{d.approvedByName}</div>}
                  {d.misaExportCode && <div className="phu">Đã chuyển kế toán ({d.misaExportCode})</div>}
                </td>
                <td>{d.coTheDuyet && <button className="nho" onClick={() => duyet(d)}>Duyệt</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ds.length > 0 && <p className="phu">Tổng quy đổi: {tien(Math.round(tongUsd * 100) / 100, 'USD')}</p>}
    </KhungTrang>
  );
}

export default function TrangDeNghiThuPhi() {
  return (
    <Suspense fallback={null}>
      <DeNghiThuPhi />
    </Suspense>
  );
}
