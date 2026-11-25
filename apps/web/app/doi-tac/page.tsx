'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DoiTac, NhanKyc } from '@/lib/doi-tac';
import { NHOM_DOI_TAC, ngay, RUI_RO, VAI_DOI_TAC } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../khung-trang';

export default function DanhSachDoiTac() {
  const toi = useToi();
  const [ds, setDs] = useState<DoiTac[]>([]);
  const [q, setQ] = useState('');
  const [vai, setVai] = useState('');
  const [loi, setLoi] = useState('');
  const [moForm, setMoForm] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', country: 'VN', taxCode: '', address: '', category: 'htx', roles: ['nha_cung_cap'] as string[] });
  const [sapHetHan, setSapHetHan] = useState<{ taiLieu: { id: string; partnerId: string; partnerName: string; docType: string; expiresOn: string }[]; thamDinh: { id: string; name: string; kycExpiresAt: string }[] } | null>(null);

  const tai = useCallback(async () => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (vai) p.set('vai', vai);
    const r = await api<{ doiTac: DoiTac[] }>(`/doi-tac?${p.toString()}`);
    setDs(r.doiTac);
  }, [q, vai]);

  useEffect(() => {
    if (!toi) return;
    tai().catch((e: Error) => setLoi(e.message));
    api<typeof sapHetHan>('/doi-tac/sap-het-han?ngay=30').then(setSapHetHan).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toi]);

  async function tao(e: FormEvent) {
    e.preventDefault();
    setLoi('');
    try {
      const r = await api<{ id: string }>('/doi-tac', { body: { ...form, taxCode: form.taxCode || null, address: form.address || null } });
      window.location.href = `/doi-tac/${r.id}`;
    } catch (err) {
      setLoi((err as Error).message);
    }
  }

  if (!toi) return null;
  const coTheTao = toi.quyen.includes('DOI_TAC_QUAN_LY');
  return (
    <KhungTrang toi={toi}>
      <h1>Đối tác</h1>
      <p className="phu">Nhà cung cấp, người mua, ngân hàng, hãng tàu, giám định, kho. Chỉ đối tác thẩm định đạt mới được dùng trong hợp đồng.</p>

      {sapHetHan && (sapHetHan.taiLieu.length > 0 || sapHetHan.thamDinh.length > 0) && (
        <div className="loi">
          <strong>Cần làm lại trong 30 ngày tới:</strong>
          <ul style={{ margin: '6px 0 0' }}>
            {sapHetHan.thamDinh.map((t) => (
              <li key={t.id}><Link href={`/doi-tac/${t.id}`}>{t.name}</Link>: thẩm định hết hạn {ngay(t.kycExpiresAt)}</li>
            ))}
            {sapHetHan.taiLieu.map((d) => (
              <li key={d.id}><Link href={`/doi-tac/${d.partnerId}`}>{d.partnerName}</Link>: {d.docType} hết hạn {ngay(d.expiresOn)}</li>
            ))}
          </ul>
        </div>
      )}

      <form className="hang" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); tai().catch((er: Error) => setLoi(er.message)); }}>
        <div><label htmlFor="q">Tìm theo tên, mã, mã số thuế</label><input id="q" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div>
          <label htmlFor="vai">Vai</label>
          <select id="vai" value={vai} onChange={(e) => setVai(e.target.value)}>
            <option value="">Tất cả</option>
            {Object.entries(VAI_DOI_TAC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button>Lọc</button>
        {coTheTao && <button type="button" className="phu-btn" onClick={() => setMoForm(!moForm)}>{moForm ? 'Đóng' : 'Thêm đối tác'}</button>}
      </form>
      {loi && <div className="loi" role="alert">{loi}</div>}

      {moForm && (
        <form className="o" style={{ marginTop: 16 }} onSubmit={tao}>
          <div className="hang">
            <div><label htmlFor="ma">Mã đối tác</label><input id="ma" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="VD: HTX-EATU" /></div>
            <div style={{ flexBasis: 320 }}><label htmlFor="ten">Tên đầy đủ</label><input id="ten" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label htmlFor="qg">Quốc gia (2 chữ)</label><input id="qg" required maxLength={2} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
          </div>
          <div className="hang">
            <div><label htmlFor="mst">Mã số thuế / số đăng ký</label><input id="mst" value={form.taxCode} onChange={(e) => setForm({ ...form, taxCode: e.target.value })} /></div>
            <div>
              <label htmlFor="nhom">Phân nhóm</label>
              <select id="nhom" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {Object.entries(NHOM_DOI_TAC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <label htmlFor="dc">Địa chỉ</label><input id="dc" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <label>Vai (chọn một hoặc nhiều)</label>
          <div className="chon-vai-tro">
            {Object.entries(VAI_DOI_TAC).map(([k, v]) => (
              <label key={k}>
                <input type="checkbox" checked={form.roles.includes(k)} onChange={(e) => setForm({ ...form, roles: e.target.checked ? [...form.roles, k] : form.roles.filter((r) => r !== k) })} />
                {v}
              </label>
            ))}
          </div>
          <button style={{ marginTop: 16 }}>Tạo đối tác</button>
        </form>
      )}

      <div className="bang-cuon" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Mã</th><th>Tên</th><th>Vai</th><th>Quốc gia</th><th>Thẩm định</th><th>Rủi ro</th><th>Phụ trách</th></tr></thead>
          <tbody>
            {ds.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/doi-tac/${p.id}`}>{p.code}</Link></td>
                <td>{p.name}<div className="phu">{NHOM_DOI_TAC[p.category] ?? p.category}</div></td>
                <td>{p.roles.map((r) => <span className="nhan" key={r}>{VAI_DOI_TAC[r] ?? r}</span>)}</td>
                <td>{p.country}</td>
                <td><NhanKyc s={p.kycStatus} />{p.kycExpiresAt && <div className="phu">đến {ngay(p.kycExpiresAt)}</div>}</td>
                <td>{p.riskRating ? RUI_RO[p.riskRating] : '—'}</td>
                <td>{p.ownerName ?? '—'}</td>
              </tr>
            ))}
            {ds.length === 0 && <tr><td colSpan={7} className="phu">Chưa có đối tác nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </KhungTrang>
  );
}
