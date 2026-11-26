'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BangMau, LOAI_MAU, Mau, TRANG_THAI_MAU } from '@/lib/ban-hang';
import { DoiTac } from '@/lib/doi-tac';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface LoXuat { id: string; code: string; buyerPartnerId: string; commodityId: string; status: string }

export default function DanhSachMau() {
  const toi = useToi();
  const [ds, setDs] = useState<Mau[]>([]);
  const [loai, setLoai] = useState('');
  const [trangThai, setTrangThai] = useState('');
  const [loi, setLoi] = useState('');
  const [mo, setMo] = useState(false);
  const [v, setV] = useState({ loai: 'truoc_xuat', doiTacId: '', matHangId: '', loXuatId: '', khoiLuongG: '300', moTa: '', luuDen: '' });
  const [chon, setChon] = useState<{ mua: DoiTac[]; matHang: { id: string; name: string }[]; loXuat: LoXuat[] }>({ mua: [], matHang: [], loXuat: [] });

  const tai = useCallback(async () => {
    const p = new URLSearchParams();
    if (loai) p.set('loai', loai);
    if (trangThai) p.set('trangThai', trangThai);
    setDs((await api<{ mau: Mau[] }>(`/mau?${p.toString()}`)).mau);
  }, [loai, trangThai]);
  useEffect(() => {
    if (!toi) return;
    tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  async function moForm() {
    setMo(!mo);
    if (chon.matHang.length) return;
    try {
      const [a, b, c] = await Promise.all([
        api<{ doiTac: DoiTac[] }>('/doi-tac?vai=nguoi_mua'),
        api<{ matHang: { id: string; name: string; active: boolean }[] }>('/danh-muc/mat-hang'),
        api<{ loXuat: LoXuat[] }>('/lo-xuat').catch(() => ({ loXuat: [] })),
      ]);
      setChon({ mua: a.doiTac, matHang: b.matHang.filter((m) => m.active), loXuat: c.loXuat.filter((l) => l.status !== 'da_huy' && l.status !== 'hoan_tat') });
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  async function tao(e: FormEvent) {
    e.preventDefault();
    setLoi('');
    try {
      await api('/mau', {
        body: { loai: v.loai, doiTacId: v.doiTacId, matHangId: v.matHangId, loXuatId: v.loXuatId || null, khoiLuongG: v.khoiLuongG ? Number(v.khoiLuongG) : null, moTa: v.moTa || null, luuDen: v.loai === 'doi_chung' ? v.luuDen || null : null },
      });
      setMo(false);
      await tai();
    } catch (err) {
      setLoi((err as Error).message);
    }
  }

  if (!toi) return null;
  const coTheLap = toi.quyen.includes('HOP_DONG_SOAN_TAT_CA') || toi.quyen.includes('HOP_DONG_SOAN_CUA_MINH');
  const loPhuHop = chon.loXuat.filter((l) => (!v.doiTacId || l.buyerPartnerId === v.doiTacId) && (!v.matHangId || l.commodityId === v.matHangId));
  return (
    <KhungTrang toi={toi}>
      <h1>Mẫu hàng</h1>
      <p className="phu">
        Mẫu chào hàng gửi theo phiếu hỏi hàng; mẫu trước xuất lấy từ lô xuất để người mua duyệt trước khi xếp tàu; mẫu đối chứng Vạn Thuận lưu lại. · <Link href="/ban-hang/hoi-hang">Hỏi hàng</Link>
      </p>
      <form className="hang" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); tai().catch((er: Error) => setLoi(er.message)); }}>
        <div><label htmlFor="lm">Loại</label><select id="lm" value={loai} onChange={(e) => setLoai(e.target.value)}><option value="">Tất cả</option>{Object.entries(LOAI_MAU).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
        <div><label htmlFor="tt">Trạng thái</label><select id="tt" value={trangThai} onChange={(e) => setTrangThai(e.target.value)}><option value="">Tất cả</option>{Object.entries(TRANG_THAI_MAU).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
        {coTheLap && <button type="button" className="phu-btn" onClick={moForm}>Mẫu trước xuất hoặc đối chứng</button>}
      </form>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {mo && (
        <form className="o" style={{ marginTop: 16 }} onSubmit={tao}>
          <p className="phu" style={{ marginTop: 0 }}>Mẫu chào hàng lập từ trang phiếu hỏi hàng.</p>
          <div className="hang">
            <div><label htmlFor="l">Loại</label><select id="l" value={v.loai} onChange={(e) => setV({ ...v, loai: e.target.value })}><option value="truoc_xuat">Trước xuất</option><option value="doi_chung">Đối chứng</option></select></div>
            <div style={{ flexBasis: 260 }}><label htmlFor="nm">Người mua</label><select id="nm" required value={v.doiTacId} onChange={(e) => setV({ ...v, doiTacId: e.target.value, loXuatId: '' })}><option value="">Chọn…</option>{chon.mua.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label htmlFor="mh">Mặt hàng</label><select id="mh" required value={v.matHangId} onChange={(e) => setV({ ...v, matHangId: e.target.value, loXuatId: '' })}><option value="">Chọn…</option>{chon.matHang.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            <div><label htmlFor="lx">Lô xuất</label><select id="lx" required value={v.loXuatId} onChange={(e) => setV({ ...v, loXuatId: e.target.value })}><option value="">Chọn…</option>{loPhuHop.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}</select></div>
          </div>
          <div className="hang">
            <div><label htmlFor="kl">Khối lượng (g)</label><input id="kl" inputMode="numeric" value={v.khoiLuongG} onChange={(e) => setV({ ...v, khoiLuongG: e.target.value })} /></div>
            {v.loai === 'doi_chung' && <div><label htmlFor="ld">Lưu đến ngày</label><input id="ld" type="date" value={v.luuDen} onChange={(e) => setV({ ...v, luuDen: e.target.value })} /></div>}
            <div style={{ flexBasis: 360 }}><label htmlFor="mt">Mô tả</label><input id="mt" value={v.moTa} onChange={(e) => setV({ ...v, moTa: e.target.value })} /></div>
            <button>Tạo mẫu</button>
          </div>
        </form>
      )}
      <BangMau ds={ds} taiLai={() => tai().catch((e: Error) => setLoi(e.message))} />
    </KhungTrang>
  );
}
