'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DoiTac } from '@/lib/doi-tac';
import { DIEU_KHOAN_TRONG, DieuKhoan, NhanTrangThai, NhapDieuKhoan } from '@/lib/hop-dong';
import { LOAI_HOP_DONG, LOAI_HOP_DONG_NGAN, ngay, TRANG_THAI_HOP_DONG } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../khung-trang';

interface DongHopDong {
  id: string;
  code: string;
  kind: string;
  status: string;
  currentVersion: number;
  signedVersion: number | null;
  sellerName: string | null;
  buyerName: string | null;
  commodityName: string;
  ownerName: string;
  updatedAt: string;
}

/** Bên nào cần chọn theo loại hợp đồng; null nghĩa là Vạn Thuận đứng bên đó. */
const CAN_BEN: Record<string, { ban: 'co' | 'khong' | 'tuy'; mua: 'co' | 'khong' | 'tuy' }> = {
  mua: { ban: 'co', mua: 'khong' },
  ban: { ban: 'khong', mua: 'co' },
  moi_gioi: { ban: 'co', mua: 'tuy' },
  mua_ban_truc_tiep: { ban: 'co', mua: 'co' },
};

export default function DanhSachHopDong() {
  const toi = useToi();
  const [ds, setDs] = useState<DongHopDong[]>([]);
  const [q, setQ] = useState('');
  const [trangThai, setTrangThai] = useState('');
  const [loi, setLoi] = useState('');
  const [moForm, setMoForm] = useState(false);
  const [ncc, setNcc] = useState<DoiTac[]>([]);
  const [nguoiMua, setNguoiMua] = useState<DoiTac[]>([]);
  const [matHang, setMatHang] = useState<{ id: string; name: string; active: boolean }[]>([]);
  const [form, setForm] = useState({ loai: 'mua', benBanId: '', benMuaId: '', matHangId: '' });
  const [dk, setDk] = useState<DieuKhoan>({ ...DIEU_KHOAN_TRONG, tienTe: 'VND', incoterms: 'EXW' });

  const tai = useCallback(async () => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (trangThai) p.set('trangThai', trangThai);
    const r = await api<{ hopDong: DongHopDong[] }>(`/hop-dong?${p.toString()}`);
    setDs(r.hopDong);
  }, [q, trangThai]);

  useEffect(() => {
    if (!toi) return;
    tai().catch((e: Error) => setLoi(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toi]);

  async function moTao() {
    setMoForm(!moForm);
    if (ncc.length || nguoiMua.length) return;
    try {
      const [a, b, c] = await Promise.all([
        api<{ doiTac: DoiTac[] }>('/doi-tac?vai=nha_cung_cap&kyc=dat'),
        api<{ doiTac: DoiTac[] }>('/doi-tac?vai=nguoi_mua&kyc=dat'),
        api<{ matHang: { id: string; name: string; active: boolean }[] }>('/danh-muc/mat-hang'),
      ]);
      setNcc(a.doiTac.filter((p) => p.kycStatus === 'dat'));
      setNguoiMua(b.doiTac.filter((p) => p.kycStatus === 'dat'));
      setMatHang(c.matHang.filter((m) => m.active));
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  async function tao(e: FormEvent) {
    e.preventDefault();
    setLoi('');
    const can = CAN_BEN[form.loai];
    try {
      const r = await api<{ id: string }>('/hop-dong', {
        body: {
          loai: form.loai,
          benBanId: can.ban === 'khong' ? null : form.benBanId || null,
          benMuaId: can.mua === 'khong' ? null : form.benMuaId || null,
          matHangId: form.matHangId,
          dieuKhoan: dk,
        },
      });
      window.location.href = `/hop-dong/${r.id}`;
    } catch (err) {
      setLoi((err as Error).message);
    }
  }

  if (!toi) return null;
  const coTheSoan = toi.quyen.includes('HOP_DONG_SOAN_TAT_CA') || toi.quyen.includes('HOP_DONG_SOAN_CUA_MINH');
  const can = CAN_BEN[form.loai];
  return (
    <KhungTrang toi={toi}>
      <h1>Hợp đồng</h1>
      <p className="phu">
        Mọi lần tạo, sửa, trình ký, ký, phụ lục, huỷ đều được ghi vào sổ cái không sửa được. Chỉ đối tác thẩm định đạt mới chọn được.
        {toi.quyen.includes('HOP_DONG_DUYET_KY') && <> · <Link href="/hop-dong/uy-quyen">Ủy quyền ký</Link></>}
      </p>

      <form className="hang" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); tai().catch((er: Error) => setLoi(er.message)); }}>
        <div><label htmlFor="q">Tìm theo số hợp đồng, tên đối tác</label><input id="q" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div>
          <label htmlFor="tt">Trạng thái</label>
          <select id="tt" value={trangThai} onChange={(e) => setTrangThai(e.target.value)}>
            <option value="">Tất cả</option>
            {Object.entries(TRANG_THAI_HOP_DONG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button>Lọc</button>
        {coTheSoan && <button type="button" className="phu-btn" onClick={moTao}>{moForm ? 'Đóng' : 'Soạn hợp đồng mới'}</button>}
      </form>
      {loi && <div className="loi" role="alert">{loi}</div>}

      {moForm && (
        <form className="o" style={{ marginTop: 16 }} onSubmit={tao}>
          <label htmlFor="loai">Loại hợp đồng</label>
          <select id="loai" value={form.loai} onChange={(e) => setForm({ ...form, loai: e.target.value })}>
            {Object.entries(LOAI_HOP_DONG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="hang">
            {can.ban !== 'khong' && (
              <div style={{ flexBasis: 300 }}>
                <label htmlFor="bb">Bên bán (nhà cung cấp)</label>
                <select id="bb" required value={form.benBanId} onChange={(e) => setForm({ ...form, benBanId: e.target.value })}>
                  <option value="">Chọn…</option>
                  {ncc.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                </select>
              </div>
            )}
            {can.mua !== 'khong' && (
              <div style={{ flexBasis: 300 }}>
                <label htmlFor="bm">Bên mua (người mua){can.mua === 'tuy' ? ' — không bắt buộc' : ''}</label>
                <select id="bm" required={can.mua === 'co'} value={form.benMuaId} onChange={(e) => setForm({ ...form, benMuaId: e.target.value })}>
                  <option value="">{can.mua === 'tuy' ? 'Chưa có' : 'Chọn…'}</option>
                  {nguoiMua.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="mh">Mặt hàng</label>
              <select id="mh" required value={form.matHangId} onChange={(e) => setForm({ ...form, matHangId: e.target.value })}>
                <option value="">Chọn…</option>
                {matHang.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          {(ncc.length === 0 || nguoiMua.length === 0) && <p className="phu">Danh sách chỉ hiện đối tác đã thẩm định đạt và còn hạn.</p>}
          <NhapDieuKhoan v={dk} doi={setDk} />
          <button style={{ marginTop: 16 }}>Tạo bản soạn</button>
        </form>
      )}

      <div className="bang-cuon" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Số hợp đồng</th><th>Loại</th><th>Bên bán</th><th>Bên mua</th><th>Mặt hàng</th><th>Trạng thái</th><th>Phụ trách</th><th>Cập nhật</th></tr></thead>
          <tbody>
            {ds.map((h) => (
              <tr key={h.id}>
                <td><Link href={`/hop-dong/${h.id}`}>{h.code}</Link>{h.currentVersion > 1 && <div className="phu">phiên bản {h.currentVersion}</div>}</td>
                <td>{LOAI_HOP_DONG_NGAN[h.kind] ?? h.kind}</td>
                <td>{h.sellerName ?? 'Vạn Thuận'}</td>
                <td>{h.buyerName ?? (h.kind === 'moi_gioi' ? '—' : 'Vạn Thuận')}</td>
                <td>{h.commodityName}</td>
                <td><NhanTrangThai s={h.status} /></td>
                <td>{h.ownerName}</td>
                <td>{ngay(h.updatedAt)}</td>
              </tr>
            ))}
            {ds.length === 0 && <tr><td colSpan={8} className="phu">Chưa có hợp đồng nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </KhungTrang>
  );
}
