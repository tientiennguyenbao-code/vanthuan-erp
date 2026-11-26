'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { kg, LOAI_GIAO_DICH, TRANG_THAI_LO_MUA } from '@/lib/lo-hang';
import { NhanEudr } from '@/lib/thu-gom';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface DongLoMua {
  id: string;
  eudrClass: string | null;
  code: string;
  dealType: string;
  status: string;
  supplierName: string;
  commodityName: string;
  contractCode: string;
  growingAreaCode: string | null;
  collectedKg: number;
  lossKg: number;
  availableKg: number;
  allocatedKg: number;
  unallocatedKg: number;
}
interface HopDongKhaDung { id: string; code: string; sellerName: string | null; commodityName: string; dealType: string }

export default function DanhSachLoMua() {
  const toi = useToi();
  const router = useRouter();
  const [ds, setDs] = useState<DongLoMua[]>([]);
  const [trangThai, setTrangThai] = useState('');
  const [loi, setLoi] = useState('');
  const [moForm, setMoForm] = useState(false);
  const [hd, setHd] = useState<HopDongKhaDung[]>([]);
  const [form, setForm] = useState({ hopDongId: '', maVungTrong: '', maCoSoDongGoi: '', ngayThuHoach: '', chungNhan: '' });
  const coTheTao = !!toi && (toi.quyen.includes('LO_HANG_PHAN_CONG') || toi.quyen.includes('LO_HANG_QUAN_LY_CUA_MINH'));

  const tai = useCallback(async () => {
    const r = await api<{ loMua: DongLoMua[] }>(`/lo-mua${trangThai ? `?trangThai=${trangThai}` : ''}`);
    setDs(r.loMua);
  }, [trangThai]);

  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  async function moTao() {
    setMoForm(!moForm);
    if (!moForm) {
      const r = await api<{ choLoMua: HopDongKhaDung[] }>('/lo-mua/hop-dong-kha-dung').catch((e: Error) => { setLoi(e.message); return null; });
      if (r) setHd(r.choLoMua);
    }
  }

  async function tao(e: FormEvent) {
    e.preventDefault();
    setLoi('');
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v || null]));
      const r = await api<{ id: string }>('/lo-mua', { body });
      router.push(`/lo-hang/lo-mua/${r.id}`);
    } catch (err) {
      setLoi((err as Error).message);
    }
  }

  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <p><Link href="/lo-hang">← Bảng điều phối</Link></p>
      <h1>Lô mua</h1>
      <p className="phu">Hàng của một nhà cung cấp theo một hợp đồng đã ký. Thu gom, sơ chế và nhập kho ghi theo lô mua; khi đóng gói, hàng được phân bổ sang các lô xuất.</p>
      {loi && <div className="loi" role="alert">{loi}</div>}
      <div className="hang" style={{ marginTop: 16 }}>
        <div>
          <label htmlFor="tt">Trạng thái</label>
          <select id="tt" value={trangThai} onChange={(e) => setTrangThai(e.target.value)}>
            <option value="">Tất cả</option>
            {Object.entries(TRANG_THAI_LO_MUA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {coTheTao && <button onClick={moTao}>{moForm ? 'Đóng' : 'Tạo lô mua'}</button>}
      </div>

      {moForm && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={tao}>
          <label htmlFor="hd">Hợp đồng đã ký với nhà cung cấp (hợp đồng mua, hoặc hợp đồng môi giới)</label>
          <select id="hd" required value={form.hopDongId} onChange={(e) => setForm({ ...form, hopDongId: e.target.value })}>
            <option value="">Chọn hợp đồng</option>
            {hd.map((h) => <option key={h.id} value={h.id}>{h.code} · {h.sellerName} · {h.commodityName}</option>)}
          </select>
          <div className="hang">
            <div><label htmlFor="vt">Mã số vùng trồng</label><input id="vt" value={form.maVungTrong} onChange={(e) => setForm({ ...form, maVungTrong: e.target.value })} /></div>
            <div><label htmlFor="csdg">Mã cơ sở đóng gói</label><input id="csdg" value={form.maCoSoDongGoi} onChange={(e) => setForm({ ...form, maCoSoDongGoi: e.target.value })} /></div>
            <div><label htmlFor="nth">Ngày thu hoạch</label><input id="nth" type="date" value={form.ngayThuHoach} onChange={(e) => setForm({ ...form, ngayThuHoach: e.target.value })} /></div>
          </div>
          <label htmlFor="cn">Chứng nhận đi kèm</label>
          <input id="cn" value={form.chungNhan} onChange={(e) => setForm({ ...form, chungNhan: e.target.value })} placeholder="VD: VietGAP, hết hạn 30/06/2027" />
          <button style={{ marginTop: 16 }}>Tạo lô mua</button>
        </form>
      )}

      <div className="bang-cuon" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Lô</th><th>Nhà cung cấp</th><th>Mặt hàng</th><th>Trạng thái</th><th>Thu gom</th><th>Sau sơ chế</th><th>Chưa phân bổ</th></tr></thead>
          <tbody>
            {ds.length === 0 && <tr><td colSpan={7} className="phu">Chưa có lô mua nào.</td></tr>}
            {ds.map((d) => (
              <tr key={d.id} className={d.status === 'da_huy' ? 'huy' : ''}>
                <td><Link href={`/lo-hang/lo-mua/${d.id}`}>{d.code}</Link><div className="phu">{d.contractCode} · {LOAI_GIAO_DICH[d.dealType]}</div></td>
                <td>{d.supplierName}{d.growingAreaCode && <div className="phu">Vùng trồng {d.growingAreaCode}</div>}</td>
                <td>{d.commodityName}</td>
                <td>{TRANG_THAI_LO_MUA[d.status]}{d.eudrClass && <div><NhanEudr eudrClass={d.eudrClass} /></div>}</td>
                <td>{kg(d.collectedKg)}</td>
                <td>{d.status === 'thu_gom' ? '—' : kg(d.availableKg)}</td>
                <td>{d.status === 'thu_gom' ? '—' : kg(d.unallocatedKg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </KhungTrang>
  );
}
