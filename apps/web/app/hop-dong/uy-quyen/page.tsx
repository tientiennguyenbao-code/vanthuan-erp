'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ngay, tien } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface UyQuyen {
  id: string;
  granteeName: string;
  grantorName: string;
  documentRef: string;
  validFrom: string;
  validTo: string;
  maxValueUsd: number | null;
  revokedAt: string | null;
  revokeReason: string | null;
  conHieuLuc: boolean;
}

export default function UyQuyenKy() {
  const toi = useToi();
  const [ds, setDs] = useState<UyQuyen[]>([]);
  const [pgd, setPgd] = useState<{ id: string; hoTen: string; email: string }[]>([]);
  const [loi, setLoi] = useState('');
  const [thongBao, setThongBao] = useState('');
  const [form, setForm] = useState({ nguoiDuocUyQuyenId: '', soVanBan: '', tuNgay: '', denNgay: '', hanMucUsd: '' });
  const coTheCap = toi?.quyen.includes('HOP_DONG_UY_QUYEN') ?? false;

  const tai = useCallback(async () => {
    const r = await api<{ uyQuyen: UyQuyen[] }>('/uy-quyen-ky');
    setDs(r.uyQuyen);
  }, []);

  useEffect(() => {
    if (!toi) return;
    tai().catch((e: Error) => setLoi(e.message));
    if (coTheCap) api<{ phoGiamDoc: typeof pgd }>('/uy-quyen-ky/pho-giam-doc').then((r) => setPgd(r.phoGiamDoc)).catch(() => undefined);
  }, [toi, tai, coTheCap]);

  async function lam(fn: () => Promise<unknown>, xong: string) {
    setLoi('');
    setThongBao('');
    try {
      await fn();
      await tai();
      setThongBao(xong);
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  function cap(e: FormEvent) {
    e.preventDefault();
    lam(
      () => api('/uy-quyen-ky', { body: { ...form, hanMucUsd: form.hanMucUsd ? Number(form.hanMucUsd.replace(/[.\s]/g, '')) : null } }),
      'Đã cấp ủy quyền ký.',
    ).then(() => setForm({ nguoiDuocUyQuyenId: '', soVanBan: '', tuNgay: '', denNgay: '', hanMucUsd: '' }));
  }

  function thuHoi(id: string) {
    const lyDo = window.prompt('Lý do thu hồi ủy quyền');
    if (lyDo) lam(() => api(`/uy-quyen-ky/${id}/thu-hoi`, { body: { lyDo } }), 'Đã thu hồi ủy quyền.');
  }

  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <p><Link href="/hop-dong">← Hợp đồng</Link></p>
      <h1>Ủy quyền ký hợp đồng</h1>
      <p className="phu">Giám đốc ký mọi hợp đồng. Phó Giám đốc chỉ ký được khi có văn bản ủy quyền còn hiệu lực và giá trị hợp đồng trong hạn mức.</p>
      {thongBao && <div className="dat" role="status">{thongBao}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}

      {coTheCap && (
        <form className="o" style={{ marginTop: 16 }} onSubmit={cap}>
          <strong>Cấp ủy quyền mới</strong>
          <div className="hang">
            <div style={{ flexBasis: 260 }}>
              <label htmlFor="pgd">Phó Giám đốc</label>
              <select id="pgd" required value={form.nguoiDuocUyQuyenId} onChange={(e) => setForm({ ...form, nguoiDuocUyQuyenId: e.target.value })}>
                <option value="">Chọn…</option>
                {pgd.map((p) => <option key={p.id} value={p.id}>{p.hoTen} ({p.email})</option>)}
              </select>
            </div>
            <div><label htmlFor="so">Số văn bản ủy quyền</label><input id="so" required value={form.soVanBan} onChange={(e) => setForm({ ...form, soVanBan: e.target.value })} placeholder="VD: 01/2026/UQ-VTG" /></div>
          </div>
          <div className="hang">
            <div><label htmlFor="tu">Từ ngày</label><input id="tu" type="date" required value={form.tuNgay} onChange={(e) => setForm({ ...form, tuNgay: e.target.value })} /></div>
            <div><label htmlFor="den">Đến hết ngày</label><input id="den" type="date" required value={form.denNgay} onChange={(e) => setForm({ ...form, denNgay: e.target.value })} /></div>
            <div><label htmlFor="hm">Hạn mức mỗi hợp đồng (USD), để trống là không giới hạn</label><input id="hm" inputMode="numeric" value={form.hanMucUsd} onChange={(e) => setForm({ ...form, hanMucUsd: e.target.value })} /></div>
          </div>
          <button style={{ marginTop: 12 }}>Cấp ủy quyền</button>
        </form>
      )}

      <div className="bang-cuon" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Người được ủy quyền</th><th>Văn bản</th><th>Hiệu lực</th><th>Hạn mức</th><th>Tình trạng</th>{coTheCap && <th></th>}</tr></thead>
          <tbody>
            {ds.map((a) => (
              <tr key={a.id}>
                <td>{a.granteeName}<div className="phu">do {a.grantorName} cấp</div></td>
                <td>{a.documentRef}</td>
                <td>{ngay(a.validFrom)} – {ngay(new Date(new Date(a.validTo).getTime() - 1).toISOString())}</td>
                <td>{a.maxValueUsd === null ? 'Không giới hạn' : tien(a.maxValueUsd, 'USD')}</td>
                <td>{a.revokedAt ? <span className="kyc-canh-bao">Đã thu hồi<div className="phu">{a.revokeReason}</div></span> : a.conHieuLuc ? <span className="kyc-dat">Còn hiệu lực</span> : 'Hết hạn hoặc chưa tới ngày'}</td>
                {coTheCap && <td>{!a.revokedAt && <button className="phu-btn nho" onClick={() => thuHoi(a.id)}>Thu hồi</button>}</td>}
              </tr>
            ))}
            {ds.length === 0 && <tr><td colSpan={6} className="phu">Chưa có ủy quyền nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </KhungTrang>
  );
}
