'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DoiTac, NhanKyc } from '@/lib/doi-tac';
import { NHOM_DOI_TAC, ngay, RUI_RO, VAI_DOI_TAC } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { TaiKhoanCong } from '@/lib/cong';
import { KhungTrang } from '../../khung-trang';

interface LienHe { id: string; name: string; position: string | null; email: string | null; phone: string | null; isPrimary: boolean }
interface TaiLieu {
  id: string; docType: string; number: string | null; issuer: string | null; issuedOn: string | null; expiresOn: string | null;
  note: string | null; voidedAt: string | null; voidReason: string | null; sapHetHan: boolean;
}
type ChiTiet = DoiTac & { contacts: LienHe[]; documents: TaiLieu[] };

export default function ChiTietDoiTac() {
  const { id } = useParams<{ id: string }>();
  const toi = useToi();
  const [p, setP] = useState<ChiTiet | null>(null);
  const [loi, setLoi] = useState('');
  const [tb, setTb] = useState('');
  const [lh, setLh] = useState({ name: '', position: '', email: '', phone: '' });
  const [tl, setTl] = useState({ docType: '', number: '', issuer: '', issuedOn: '', expiresOn: '' });
  const [tdinh, setTdinh] = useState({ riskRating: 'thap', screeningNote: '' });
  const [lyDoTuChoi, setLyDoTuChoi] = useState('');

  const tai = useCallback(() => api<ChiTiet>(`/doi-tac/${id}`).then(setP), [id]);
  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  async function lam(viec: () => Promise<unknown>, xong: string) {
    setLoi('');
    setTb('');
    try {
      await viec();
      setTb(xong);
      await tai();
    } catch (e) {
      setLoi((e as Error).message);
    }
  }
  const rong = (v: string) => (v.trim() ? v.trim() : null);

  if (!toi || !p) return toi ? <KhungTrang toi={toi}>{loi ? <div className="loi">{loi}</div> : null}</KhungTrang> : null;
  const coQuyen = (q: string) => toi.quyen.includes(q);
  const suaDuoc = coQuyen('DOI_TAC_QUAN_LY_TAT_CA') || (coQuyen('DOI_TAC_QUAN_LY') && p.ownerUserId === toi.id);
  const trinhDuoc = suaDuoc && ['nhap', 'tu_choi', 'het_han'].includes(p.kycStatus);
  const duyetDuoc = p.kycStatus === 'cho_tham_dinh' && coQuyen('DOI_TAC_DUYET') && p.kycSubmittedBy !== toi.id && (p.riskRating !== 'cao' || coQuyen('DOI_TAC_DUYET_RUI_RO_CAO'));

  return (
    <KhungTrang toi={toi}>
      <p><Link href="/doi-tac">← Danh sách đối tác</Link></p>
      <h1>{p.name}</h1>
      <p className="phu">
        {p.code} · {NHOM_DOI_TAC[p.category] ?? p.category} · {p.country}
        {p.taxCode && <> · MST {p.taxCode}</>} · Phụ trách: {p.ownerName ?? '—'}
      </p>
      <p>{p.roles.map((r) => <span className="nhan" key={r}>{VAI_DOI_TAC[r] ?? r}</span>)}</p>
      {p.address && <p>{p.address}</p>}
      {loi && <div className="loi" role="alert">{loi}</div>}
      {tb && <div className="dat">{tb}</div>}

      <h2>Thẩm định</h2>
      <div className="o">
        <div>Trạng thái: <NhanKyc s={p.kycStatus} />{p.kycExpiresAt && <> · hiệu lực đến {ngay(p.kycExpiresAt)}</>}</div>
        {p.riskRating && <div>Rủi ro: {RUI_RO[p.riskRating]}</div>}
        {p.screeningNote && <div className="phu">Sàng lọc: {p.screeningNote}</div>}
        {p.kycRejectReason && p.kycStatus === 'tu_choi' && <div className="kyc-canh-bao">Lý do từ chối: {p.kycRejectReason}</div>}

        {trinhDuoc && (
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); lam(() => api(`/doi-tac/${id}/trinh-tham-dinh`, { body: tdinh }), 'Đã trình thẩm định.'); }}>
            <div className="hang">
              <div>
                <label htmlFor="rr">Xếp hạng rủi ro</label>
                <select id="rr" value={tdinh.riskRating} onChange={(e) => setTdinh({ ...tdinh, riskRating: e.target.value })}>
                  {Object.entries(RUI_RO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <label htmlFor="sl">Kết quả sàng lọc (danh sách trừng phạt, người có ảnh hưởng chính trị, quốc gia rủi ro)</label>
            <textarea id="sl" required value={tdinh.screeningNote} onChange={(e) => setTdinh({ ...tdinh, screeningNote: e.target.value })} />
            <button style={{ marginTop: 12 }}>Trình thẩm định</button>
          </form>
        )}

        {duyetDuoc && (
          <div style={{ marginTop: 12 }}>
            <button onClick={() => lam(() => api(`/doi-tac/${id}/quyet-dinh-tham-dinh`, { body: { dongY: true } }), 'Đã duyệt thẩm định.')}>Duyệt đạt</button>
            <label htmlFor="ld">Hoặc từ chối, ghi lý do</label>
            <div className="hang">
              <input id="ld" value={lyDoTuChoi} onChange={(e) => setLyDoTuChoi(e.target.value)} />
              <button className="phu-btn" onClick={() => lam(() => api(`/doi-tac/${id}/quyet-dinh-tham-dinh`, { body: { dongY: false, lyDo: lyDoTuChoi } }), 'Đã từ chối.')}>Từ chối</button>
            </div>
          </div>
        )}
        {p.kycStatus === 'cho_tham_dinh' && p.kycSubmittedBy === toi.id && <p className="phu">Bạn đã trình hồ sơ này nên cần người khác duyệt.</p>}
      </div>

      <h2>Tài liệu pháp lý và chứng nhận</h2>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Loại</th><th>Số</th><th>Nơi cấp</th><th>Ngày cấp</th><th>Hết hạn</th><th></th></tr></thead>
          <tbody>
            {p.documents.map((d) => (
              <tr key={d.id} className={d.voidedAt ? 'huy' : ''}>
                <td>{d.docType}{d.voidReason && <div className="phu">Đã huỷ: {d.voidReason}</div>}</td>
                <td>{d.number ?? '—'}</td>
                <td>{d.issuer ?? '—'}</td>
                <td>{d.issuedOn ?? '—'}</td>
                <td className={d.sapHetHan ? 'kyc-canh-bao' : ''}>{d.expiresOn ?? 'Không thời hạn'}</td>
                <td>
                  {suaDuoc && !d.voidedAt && (
                    <button className="nho phu-btn" onClick={() => {
                      const lyDo = window.prompt('Lý do huỷ tài liệu này?');
                      if (lyDo) lam(() => api(`/doi-tac/${id}/tai-lieu/${d.id}/huy`, { body: { lyDo } }), 'Đã huỷ tài liệu.');
                    }}>Huỷ</button>
                  )}
                </td>
              </tr>
            ))}
            {p.documents.length === 0 && <tr><td colSpan={6} className="phu">Chưa có tài liệu.</td></tr>}
          </tbody>
        </table>
      </div>
      {suaDuoc && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); lam(() => api(`/doi-tac/${id}/tai-lieu`, { body: { docType: tl.docType, number: rong(tl.number), issuer: rong(tl.issuer), issuedOn: rong(tl.issuedOn), expiresOn: rong(tl.expiresOn) } }).then(() => setTl({ docType: '', number: '', issuer: '', issuedOn: '', expiresOn: '' })), 'Đã thêm tài liệu.'); }}>
          <div className="hang">
            <div><label htmlFor="lt">Loại tài liệu</label><input id="lt" required list="loai-tl" value={tl.docType} onChange={(e) => setTl({ ...tl, docType: e.target.value })} /></div>
            <div><label htmlFor="so">Số</label><input id="so" value={tl.number} onChange={(e) => setTl({ ...tl, number: e.target.value })} /></div>
            <div><label htmlFor="nc">Nơi cấp</label><input id="nc" value={tl.issuer} onChange={(e) => setTl({ ...tl, issuer: e.target.value })} /></div>
            <div><label htmlFor="ngc">Ngày cấp</label><input id="ngc" type="date" value={tl.issuedOn} onChange={(e) => setTl({ ...tl, issuedOn: e.target.value })} /></div>
            <div><label htmlFor="nhh">Ngày hết hạn</label><input id="nhh" type="date" value={tl.expiresOn} onChange={(e) => setTl({ ...tl, expiresOn: e.target.value })} /></div>
            <button>Thêm tài liệu</button>
          </div>
          <datalist id="loai-tl">
            {['Giấy chứng nhận đăng ký doanh nghiệp', 'Giấy chứng nhận đăng ký HTX', 'VietGAP', 'GlobalG.A.P.', 'HACCP', 'ISO 22000', 'Chứng nhận hữu cơ', 'Mã số vùng trồng', 'Mã số cơ sở đóng gói', 'Đăng ký FDA', 'Mã đăng ký GACC', 'Danh sách EU', 'Business licence'].map((x) => <option key={x} value={x} />)}
          </datalist>
          <p className="phu">Tệp scan của chứng từ theo lô được tải lên ở checklist chứng từ của lô.</p>
        </form>
      )}

      <h2>Người liên hệ</h2>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Họ tên</th><th>Chức vụ</th><th>Email</th><th>Điện thoại</th></tr></thead>
          <tbody>
            {p.contacts.map((c) => (
              <tr key={c.id}><td>{c.name}{c.isPrimary && <span className="nhan" style={{ marginLeft: 6 }}>Chính</span>}</td><td>{c.position ?? '—'}</td><td>{c.email ?? '—'}</td><td>{c.phone ?? '—'}</td></tr>
            ))}
            {p.contacts.length === 0 && <tr><td colSpan={4} className="phu">Chưa có người liên hệ.</td></tr>}
          </tbody>
        </table>
      </div>
      {suaDuoc && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); lam(() => api(`/doi-tac/${id}/lien-he`, { body: { name: lh.name, position: rong(lh.position), email: rong(lh.email), phone: rong(lh.phone), isPrimary: p.contacts.length === 0 } }).then(() => setLh({ name: '', position: '', email: '', phone: '' })), 'Đã thêm người liên hệ.'); }}>
          <div className="hang">
            <div><label htmlFor="lhten">Họ tên</label><input id="lhten" required value={lh.name} onChange={(e) => setLh({ ...lh, name: e.target.value })} /></div>
            <div><label htmlFor="lhcv">Chức vụ</label><input id="lhcv" value={lh.position} onChange={(e) => setLh({ ...lh, position: e.target.value })} /></div>
            <div><label htmlFor="lhem">Email</label><input id="lhem" type="email" value={lh.email} onChange={(e) => setLh({ ...lh, email: e.target.value })} /></div>
            <div><label htmlFor="lhdt">Điện thoại</label><input id="lhdt" value={lh.phone} onChange={(e) => setLh({ ...lh, phone: e.target.value })} /></div>
            <button>Thêm</button>
          </div>
        </form>
      )}

      {suaDuoc && p.kycStatus === 'dat' && p.roles.includes('nha_cung_cap') && (
        <>
          <h2>Tài khoản cổng nhà cung cấp</h2>
          <TaiKhoanCong doiTacId={p.id} />
        </>
      )}
    </KhungTrang>
  );
}
