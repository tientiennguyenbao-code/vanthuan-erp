'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Den, kg, LOAI_GIAO_DICH, THI_TRUONG, TRANG_THAI_LO_XUAT } from '@/lib/lo-hang';
import { ngay } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { useRouter } from 'next/navigation';
import { KhungTrang } from '../khung-trang';

interface DongLo {
  id: string;
  code: string;
  dealType: string;
  status: string;
  market: string;
  buyerName: string;
  commodityName: string;
  contractCode: string;
  ownerName: string;
  etd: string | null;
  allocatedKg: number;
  bookingNumber: string | null;
  ngayDenCutoff: number | null;
  giamDinh: string | null;
  den: 'do' | 'vang' | 'xanh';
}
interface HopDongKhaDung {
  id: string;
  code: string;
  kind: string;
  sellerName: string | null;
  buyerName: string | null;
  commodityName: string;
}

export default function BangDieuPhoi() {
  const toi = useToi();
  const router = useRouter();
  const [ds, setDs] = useState<DongLo[]>([]);
  const [trangThai, setTrangThai] = useState('');
  const [thiTruong, setThiTruong] = useState('');
  const [loi, setLoi] = useState('');
  const [moForm, setMoForm] = useState(false);
  const [hd, setHd] = useState<HopDongKhaDung[]>([]);
  const [form, setForm] = useState({ hopDongDoiUngId: '', thiTruong: 'US', etd: '', eta: '' });
  const coTheTao = !!toi && (toi.quyen.includes('LO_HANG_PHAN_CONG') || toi.quyen.includes('LO_HANG_QUAN_LY_CUA_MINH'));

  const tai = useCallback(async () => {
    const p = new URLSearchParams();
    if (trangThai) p.set('trangThai', trangThai);
    if (thiTruong) p.set('thiTruong', thiTruong);
    const r = await api<{ loXuat: DongLo[] }>(`/lo-xuat?${p.toString()}`);
    setDs(r.loXuat);
  }, [trangThai, thiTruong]);

  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  async function moTao() {
    setMoForm(!moForm);
    if (!moForm) {
      const r = await api<{ choLoXuat: HopDongKhaDung[] }>('/lo-mua/hop-dong-kha-dung').catch((e: Error) => { setLoi(e.message); return null; });
      if (r) setHd(r.choLoXuat);
    }
  }

  async function tao(e: FormEvent) {
    e.preventDefault();
    setLoi('');
    try {
      const r = await api<{ id: string }>('/lo-xuat', { body: { ...form, etd: form.etd || null, eta: form.eta || null } });
      router.push(`/lo-hang/${r.id}`);
    } catch (err) {
      setLoi((err as Error).message);
    }
  }

  if (!toi) return null;
  const canhBao = ds.filter((d) => d.den === 'do').length;

  return (
    <KhungTrang toi={toi}>
      <h1>Bảng điều phối lô hàng</h1>
      <p className="phu">
        Mỗi lô xuất ứng với một hợp đồng đối ứng và một booking. Đèn đỏ: còn 3 ngày hoặc ít hơn đến cut-off mà lô chưa xếp tàu, hoặc giám định không đạt.
        {' · '}<Link href="/lo-hang/lo-mua">Lô mua (thu gom, sơ chế, nhập kho)</Link>
      </p>
      {canhBao > 0 && <div className="loi" role="alert">{canhBao} lô cần xử lý gấp.</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}

      <div className="hang" style={{ marginTop: 16 }}>
        <div>
          <label htmlFor="tt">Bước</label>
          <select id="tt" value={trangThai} onChange={(e) => setTrangThai(e.target.value)}>
            <option value="">Tất cả</option>
            {Object.entries(TRANG_THAI_LO_XUAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="tht">Thị trường</label>
          <select id="tht" value={thiTruong} onChange={(e) => setThiTruong(e.target.value)}>
            <option value="">Tất cả</option>
            {Object.entries(THI_TRUONG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {coTheTao && <button onClick={moTao}>{moForm ? 'Đóng' : 'Tạo lô xuất'}</button>}
      </div>

      {moForm && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={tao}>
          <label htmlFor="hd">Hợp đồng đối ứng đã ký (hợp đồng bán, hoặc hợp đồng mua bán trực tiếp với môi giới)</label>
          <select id="hd" required value={form.hopDongDoiUngId} onChange={(e) => setForm({ ...form, hopDongDoiUngId: e.target.value })}>
            <option value="">Chọn hợp đồng</option>
            {hd.map((h) => <option key={h.id} value={h.id}>{h.code} · {h.buyerName} · {h.commodityName}</option>)}
          </select>
          {hd.length === 0 && <p className="phu">Chưa có hợp đồng đối ứng đã ký nào chưa có lô xuất.</p>}
          <div className="hang">
            <div>
              <label htmlFor="thm">Thị trường đích</label>
              <select id="thm" value={form.thiTruong} onChange={(e) => setForm({ ...form, thiTruong: e.target.value })}>
                {Object.entries(THI_TRUONG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label htmlFor="etd">Ngày tàu chạy dự kiến (ETD)</label><input id="etd" type="date" value={form.etd} onChange={(e) => setForm({ ...form, etd: e.target.value })} /></div>
            <div><label htmlFor="eta">Ngày đến dự kiến (ETA)</label><input id="eta" type="date" value={form.eta} onChange={(e) => setForm({ ...form, eta: e.target.value })} /></div>
          </div>
          <button style={{ marginTop: 16 }}>Tạo lô xuất</button>
        </form>
      )}

      <div className="bang-cuon" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr><th>Lô</th><th>Bước</th><th>Người mua, thị trường</th><th>Mặt hàng</th><th>Đã phân bổ</th><th>ETD</th><th>Cut-off</th><th>Phụ trách</th></tr>
          </thead>
          <tbody>
            {ds.length === 0 && <tr><td colSpan={8} className="phu">Chưa có lô xuất nào.</td></tr>}
            {ds.map((d) => (
              <tr key={d.id}>
                <td><Den mau={d.den} /><Link href={`/lo-hang/${d.id}`}>{d.code}</Link><div className="phu">{d.contractCode} · {LOAI_GIAO_DICH[d.dealType]}</div></td>
                <td>{TRANG_THAI_LO_XUAT[d.status] ?? d.status}{d.giamDinh === 'khong_dat' && <div className="kyc-canh-bao">Giám định không đạt</div>}</td>
                <td>{d.buyerName}<div className="phu">{THI_TRUONG[d.market]}</div></td>
                <td>{d.commodityName}</td>
                <td>{kg(d.allocatedKg)}</td>
                <td>{ngay(d.etd)}</td>
                <td>{d.ngayDenCutoff === null ? '—' : d.ngayDenCutoff < 0 ? `Quá ${-d.ngayDenCutoff} ngày` : `Còn ${d.ngayDenCutoff} ngày`}</td>
                <td>{d.ownerName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </KhungTrang>
  );
}
