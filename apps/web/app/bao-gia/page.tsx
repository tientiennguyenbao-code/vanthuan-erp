'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { HoiHang } from '@/lib/ban-hang';
import { BaoGia, LuaChon, NhanBaoGia, NhapBaoGia, ONhapBaoGia } from '@/lib/bao-gia';
import { DoiTac } from '@/lib/doi-tac';
import { ngay, tien, TRANG_THAI_BAO_GIA } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../khung-trang';

const trong = (): NhapBaoGia => ({
  doiTacId: '',
  matHangId: '',
  baoGiaNguonId: null,
  soLuong: 0,
  donVi: 'tan',
  donGia: 0,
  tienTe: 'USD',
  tyGiaUsd: null,
  incoterms: 'FOB',
  cangDi: null,
  cangDen: null,
  hieuLucDen: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
  quyCach: null,
  chungNhan: null,
  thoiGianGiao: null,
  thanhToan: null,
  tyLePhiPhanTram: null,
  ghiChu: null,
});

export default function DanhSachBaoGia() {
  const toi = useToi();
  const [ds, setDs] = useState<BaoGia[]>([]);
  const [loai, setLoai] = useState('');
  const [trangThai, setTrangThai] = useState('');
  const [loi, setLoi] = useState('');
  const [moForm, setMoForm] = useState<'' | 'mua' | 'ban'>('');
  const [tuPhieu, setTuPhieu] = useState('');
  const [v, setV] = useState<NhapBaoGia>(trong());
  const [chon, setChon] = useState<{ ncc: DoiTac[]; mua: DoiTac[]; matHang: LuaChon['matHang'] }>({ ncc: [], mua: [], matHang: [] });

  const tai = useCallback(async () => {
    const p = new URLSearchParams();
    if (loai) p.set('loai', loai);
    if (trangThai) p.set('trangThai', trangThai);
    setDs((await api<{ baoGia: BaoGia[] }>(`/bao-gia?${p.toString()}`)).baoGia);
  }, [loai, trangThai]);

  useEffect(() => {
    if (!toi) return;
    tai().catch((e: Error) => setLoi(e.message));
    const hoiHangId = new URLSearchParams(window.location.search).get('hoiHang');
    if (hoiHangId) tuHoiHang(hoiHangId).catch((e: Error) => setLoi(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toi]);

  /** Mở form báo giá bán, điền sẵn từ phiếu hỏi hàng. */
  async function tuHoiHang(hoiHangId: string) {
    const h = await api<HoiHang>(`/hoi-hang/${hoiHangId}`);
    await moTao('ban', false);
    setV({
      ...trong(),
      hoiHangId,
      doiTacId: h.partnerId,
      matHangId: h.commodityId,
      soLuong: h.quantity,
      donVi: h.unit,
      donGia: h.targetPrice ?? 0,
      tienTe: h.currency ?? 'USD',
      incoterms: h.incoterms ?? 'FOB',
      cangDen: h.portTo,
      quyCach: h.spec,
      chungNhan: h.certifications,
      thangGiao: h.deliveryMonth,
      ghiChu: `Theo phiếu hỏi hàng ${h.code}`,
    });
    setTuPhieu(h.code);
  }

  async function moTao(k: 'mua' | 'ban', batTat = true) {
    setMoForm(batTat && moForm === k ? '' : k);
    setTuPhieu('');
    setV({ ...trong(), tienTe: k === 'mua' ? 'VND' : 'USD', incoterms: k === 'mua' ? 'EXW' : 'FOB' });
    if (chon.matHang.length) return;
    try {
      const [a, b, c] = await Promise.all([
        api<{ doiTac: DoiTac[] }>('/doi-tac?vai=nha_cung_cap'),
        api<{ doiTac: DoiTac[] }>('/doi-tac?vai=nguoi_mua'),
        api<{ matHang: { id: string; name: string; active: boolean }[] }>('/danh-muc/mat-hang'),
      ]);
      setChon({ ncc: a.doiTac, mua: b.doiTac, matHang: c.matHang.filter((m) => m.active) });
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  async function tao(e: FormEvent) {
    e.preventDefault();
    setLoi('');
    try {
      const r = await api<{ id: string }>('/bao-gia', { body: { loai: moForm, ...v } });
      window.location.href = `/bao-gia/${r.id}`;
    } catch (err) {
      setLoi((err as Error).message);
    }
  }

  if (!toi) return null;
  const coTheLap = toi.quyen.includes('HOP_DONG_SOAN_TAT_CA') || toi.quyen.includes('HOP_DONG_SOAN_CUA_MINH');
  const nguon = ds.filter((q) => q.kind === 'mua' && q.commodityId === v.matHangId && (q.status === 'da_gui' || q.status === 'chap_nhan') && !q.hetHieuLuc);
  return (
    <KhungTrang toi={toi}>
      <h1>Báo giá</h1>
      <p className="phu">
        Báo giá mua từ nhà cung cấp, báo giá bán cho người mua. Báo giá bán được chấp nhận sẽ sinh cặp hợp đồng nháp. · <Link href="/bao-gia/so-sanh">So sánh báo giá mua</Link>
      </p>
      <form className="hang" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); tai().catch((er: Error) => setLoi(er.message)); }}>
        <div>
          <label htmlFor="loai">Loại</label>
          <select id="loai" value={loai} onChange={(e) => setLoai(e.target.value)}><option value="">Tất cả</option><option value="mua">Mua</option><option value="ban">Bán</option></select>
        </div>
        <div>
          <label htmlFor="tthai">Trạng thái</label>
          <select id="tthai" value={trangThai} onChange={(e) => setTrangThai(e.target.value)}>
            <option value="">Tất cả</option>
            {Object.entries(TRANG_THAI_BAO_GIA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        <button>Lọc</button>
        {coTheLap && <button type="button" className="phu-btn" onClick={() => moTao('mua')}>Báo giá mua mới</button>}
        {coTheLap && <button type="button" className="phu-btn" onClick={() => moTao('ban')}>Báo giá bán mới</button>}
      </form>
      {loi && <div className="loi" role="alert">{loi}</div>}

      {moForm && (
        <form className="o" style={{ marginTop: 16 }} onSubmit={tao}>
          <strong>{moForm === 'mua' ? 'Báo giá mua (nhà cung cấp chào cho Vạn Thuận)' : 'Báo giá bán (Vạn Thuận chào cho người mua)'}</strong>
          {tuPhieu && <div className="phu">Điền sẵn từ phiếu hỏi hàng {tuPhieu}; đơn giá đang là giá mục tiêu của người mua, sửa lại trước khi tạo.</div>}
          <ONhapBaoGia
            loai={moForm}
            v={v}
            doi={setV}
            chon={{ doiTac: moForm === 'mua' ? chon.ncc : chon.mua, matHang: chon.matHang, nguon: nguon.map((q) => ({ id: q.id, code: q.code, partnerName: q.partnerName })) }}
          />
          <button style={{ marginTop: 16 }}>Tạo báo giá</button>
        </form>
      )}

      <div className="bang-cuon" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Số</th><th>Loại</th><th>Đối tác</th><th>Mặt hàng</th><th>Số lượng</th><th>Đơn giá</th><th>Hiệu lực đến</th><th>Trạng thái</th></tr></thead>
          <tbody>
            {ds.map((q) => (
              <tr key={q.id}>
                <td><Link href={`/bao-gia/${q.id}`}>{q.code}</Link>{q.version > 1 && <div className="phu">sửa đổi {q.version - 1}</div>}</td>
                <td>{q.kind === 'mua' ? 'Mua' : 'Bán'}</td>
                <td>{q.partnerName}</td>
                <td>{q.commodityName}</td>
                <td>{tien(q.quantity)} {q.unit === 'tan' ? 'tấn' : 'kg'}</td>
                <td>{tien(q.unitPrice, q.currency)}</td>
                <td>{ngay(q.validUntil)}</td>
                <td><NhanBaoGia s={q.status} hetHan={q.hetHieuLuc} /></td>
              </tr>
            ))}
            {ds.length === 0 && <tr><td colSpan={8} className="phu">Chưa có báo giá nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </KhungTrang>
  );
}
