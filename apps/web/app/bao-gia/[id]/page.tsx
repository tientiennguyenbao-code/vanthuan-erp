'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BaoGia, LuaChon, NhanBaoGia, NhapBaoGia, ONhapBaoGia, tuBaoGia } from '@/lib/bao-gia';
import { DoiTac } from '@/lib/doi-tac';
import { NhanTrangThai } from '@/lib/hop-dong';
import { LOAI_CHI_PHI, LOAI_HOP_DONG_NGAN, ngay, tien } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface ChiPhi {
  kind: string;
  description: string | null;
  amount: number;
  currency: string;
  fxPerUsd: number | null;
  usd: number | null;
}

interface ChiTiet extends BaoGia {
  commodityName: string;
  ownerName: string;
  nguon: (BaoGia & { partnerName: string }) | null;
  chiPhi: ChiPhi[];
  chiPhiGoiY: string[];
  tomTat: { giaTriBanUsd: number | null; giaVonUsd: number | null; chiPhiUsd: number | null; phiTronGoiUsd: number | null; bienUsd: number | null; bienPhanTram: number | null; thieu: string[] } | null;
  hopDong: { id: string; code: string; kind: string; status: string }[];
  quyen: { sua: boolean; gui: boolean; suaDoi: boolean; tuChoi: boolean; chapNhan: boolean; huy: boolean };
}

type DongNhap = { loai: string; moTa: string; soTien: string; tienTe: string; tyGiaUsd: string };
const so = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));

export default function ChiTietBaoGia() {
  const toi = useToi();
  const { id } = useParams<{ id: string }>();
  const [q, setQ] = useState<ChiTiet | null>(null);
  const [loi, setLoi] = useState('');
  const [thongBao, setThongBao] = useState('');
  const [mo, setMo] = useState<'' | 'sua' | 'tuChoi' | 'huy' | 'chapNhan'>('');
  const [v, setV] = useState<NhapBaoGia | null>(null);
  const [chon, setChon] = useState<LuaChon>({ doiTac: [], matHang: [], nguon: [] });
  const [dong, setDong] = useState<DongNhap[]>([]);
  const [lyDo, setLyDo] = useState('');
  const [loaiGd, setLoaiGd] = useState('mua_dut');

  const tai = useCallback(async () => {
    const r = await api<ChiTiet>(`/bao-gia/${id}`);
    setQ(r);
    setV(tuBaoGia(r));
    setDong([
      ...r.chiPhi.map((c) => ({ loai: c.kind, moTa: c.description ?? '', soTien: String(c.amount), tienTe: c.currency, tyGiaUsd: c.fxPerUsd ? String(c.fxPerUsd) : '' })),
      ...r.chiPhiGoiY.map((k) => ({ loai: k, moTa: '', soTien: '', tienTe: 'USD', tyGiaUsd: '' })),
    ]);
  }, [id]);

  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  async function lam(fn: () => Promise<unknown>, xong: string) {
    setLoi('');
    setThongBao('');
    try {
      await fn();
      setMo('');
      setLyDo('');
      await tai();
      setThongBao(xong);
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  async function moSua() {
    setMo(mo === 'sua' ? '' : 'sua');
    if (!q || chon.matHang.length) return;
    const [dt, mh, ds] = await Promise.all([
      api<{ doiTac: DoiTac[] }>(`/doi-tac?vai=${q.kind === 'mua' ? 'nha_cung_cap' : 'nguoi_mua'}`),
      api<{ matHang: { id: string; name: string; active: boolean }[] }>('/danh-muc/mat-hang'),
      api<{ baoGia: BaoGia[] }>('/bao-gia?loai=mua'),
    ]);
    setChon({
      doiTac: dt.doiTac,
      matHang: mh.matHang.filter((m) => m.active),
      nguon: ds.baoGia.filter((b) => (b.status === 'da_gui' || b.status === 'chap_nhan') && !b.hetHieuLuc).map((b) => ({ id: b.id, code: b.code, partnerName: b.partnerName })),
    });
  }

  if (!toi) return null;
  if (!q || !v) return <KhungTrang toi={toi}>{loi ? <div className="loi">{loi}</div> : <p className="phu">Đang tải…</p>}</KhungTrang>;
  const dv = q.unit === 'tan' ? 'tấn' : 'kg';
  const t = q.tomTat;

  return (
    <KhungTrang toi={toi}>
      <p><Link href="/bao-gia">← Báo giá</Link></p>
      <h1>{q.code} <span style={{ fontSize: 16 }}><NhanBaoGia s={q.status} hetHan={q.hetHieuLuc} /></span></h1>
      <p className="phu">
        Báo giá {q.kind === 'mua' ? 'mua' : 'bán'} · {q.partnerName} · {q.commodityName} · {q.version > 1 ? `sửa đổi lần ${q.version - 1}` : 'bản đầu'} · hiệu lực đến {ngay(q.validUntil)} · phụ trách: {q.ownerName}
      </p>
      {q.rejectReason && <div className="loi">{q.status === 'huy' ? 'Đã huỷ' : 'Bị từ chối'}: {q.rejectReason}</div>}
      {thongBao && <div className="dat" role="status">{thongBao}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}

      <div className="luoi" style={{ marginTop: 16 }}>
        <div className="o">
          <strong>Giá</strong>
          <div style={{ fontSize: 20 }}>{tien(q.unitPrice, q.currency)} / {dv}</div>
          <div className="phu">{tien(q.quantity)} {dv} · tổng {tien(q.giaTri, q.currency)}{q.currency !== 'USD' && q.fxPerUsd ? ` · tỷ giá ${tien(q.fxPerUsd)}` : ''}</div>
          <div className="phu">{q.incoterms}{q.portFrom && ` · đi ${q.portFrom}`}{q.portTo && ` · đến ${q.portTo}`}</div>
        </div>
        <div className="o">
          <strong>Điều kiện</strong>
          <div>Giao: {q.deliveryTime ?? '—'}</div>
          <div>Thanh toán: {q.paymentTerms ?? '—'}</div>
          {q.kind === 'mua' && <div>Chứng nhận: {q.certifications ?? '—'}</div>}
          <div className="phu" style={{ whiteSpace: 'pre-wrap' }}>{q.spec ?? ''}</div>
        </div>
        {t && (
          <div className="o">
            <strong>Biên dự kiến (USD)</strong>
            <table className="bang-gon" style={{ fontSize: 14 }}>
              <tbody>
                <tr><td>Giá trị bán</td><td style={{ textAlign: 'right' }}>{tien(t.giaTriBanUsd)}</td></tr>
                <tr><td>− Giá vốn</td><td style={{ textAlign: 'right' }}>{tien(t.giaVonUsd)}</td></tr>
                <tr><td>− Chi phí</td><td style={{ textAlign: 'right' }}>{tien(t.chiPhiUsd)}</td></tr>
                <tr><td>+ Phí trọn gói {q.feeRatePct ?? 0}%</td><td style={{ textAlign: 'right' }}>{tien(t.phiTronGoiUsd)}</td></tr>
                <tr><th>Biên</th><th style={{ textAlign: 'right' }}>{tien(t.bienUsd)}{t.bienPhanTram !== null && ` (${t.bienPhanTram}%)`}</th></tr>
              </tbody>
            </table>
            {t.thieu.length > 0 && <div className="kyc-canh-bao">Thiếu: {t.thieu.join(', ')}</div>}
            {q.nguon && <div className="phu">Giá vốn theo <Link href={`/bao-gia/${q.nguon.id}`}>{q.nguon.code}</Link> của {q.nguon.partnerName}</div>}
          </div>
        )}
      </div>

      {q.kind === 'ban' && (
        <>
          <h2>Chi phí ngoài giá hàng</h2>
          <p className="phu">Gợi ý theo Incoterms {q.incoterms}; dòng để trống số tiền sẽ không được lưu.</p>
          <div className="bang-cuon">
            <table>
              <thead><tr><th>Khoản</th><th>Ghi chú</th><th>Số tiền</th><th>Tiền tệ</th><th>Tỷ giá cho 1 USD</th>{!q.quyen.sua && <th>USD</th>}</tr></thead>
              <tbody>
                {q.quyen.sua
                  ? dong.map((d, i) => {
                      const doi = (k: keyof DongNhap, val: string) => setDong(dong.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
                      return (
                        <tr key={i}>
                          <td>
                            <select aria-label="Khoản" value={d.loai} onChange={(e) => doi('loai', e.target.value)}>
                              {Object.entries(LOAI_CHI_PHI).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </select>
                          </td>
                          <td><input aria-label="Ghi chú" value={d.moTa} onChange={(e) => doi('moTa', e.target.value)} /></td>
                          <td><input aria-label="Số tiền" inputMode="decimal" value={d.soTien} onChange={(e) => doi('soTien', e.target.value)} /></td>
                          <td>
                            <select aria-label="Tiền tệ" className="o-tien" value={d.tienTe} onChange={(e) => doi('tienTe', e.target.value)}>{['USD', 'VND', 'EUR', 'CNY'].map((x) => <option key={x}>{x}</option>)}</select>
                          </td>
                          <td>{d.tienTe !== 'USD' && <input aria-label="Tỷ giá" inputMode="decimal" value={d.tyGiaUsd} onChange={(e) => doi('tyGiaUsd', e.target.value)} />}</td>
                        </tr>
                      );
                    })
                  : q.chiPhi.map((c, i) => (
                      <tr key={i}>
                        <td>{LOAI_CHI_PHI[c.kind] ?? c.kind}</td>
                        <td>{c.description ?? ''}</td>
                        <td>{tien(c.amount)}</td>
                        <td>{c.currency}</td>
                        <td>{c.fxPerUsd ? tien(c.fxPerUsd) : ''}</td>
                        <td>{tien(c.usd)}</td>
                      </tr>
                    ))}
                {!q.quyen.sua && q.chiPhi.length === 0 && <tr><td colSpan={6} className="phu">Chưa có chi phí.</td></tr>}
              </tbody>
            </table>
          </div>
          {q.quyen.sua && (
            <div className="hang" style={{ marginTop: 8 }}>
              <button className="phu-btn" onClick={() => setDong([...dong, { loai: 'khac', moTa: '', soTien: '', tienTe: 'USD', tyGiaUsd: '' }])}>Thêm dòng</button>
              <button
                onClick={() =>
                  lam(
                    () =>
                      api(`/bao-gia/${id}/chi-phi`, {
                        method: 'PUT',
                        body: {
                          dong: dong
                            .filter((d) => d.soTien.trim())
                            .map((d) => ({ loai: d.loai, moTa: d.moTa || null, soTien: so(d.soTien), tienTe: d.tienTe, tyGiaUsd: d.tyGiaUsd ? so(d.tyGiaUsd) : null })),
                        },
                      }),
                    'Đã lưu chi phí và tính lại biên.',
                  )
                }
              >
                Lưu chi phí
              </button>
            </div>
          )}
        </>
      )}

      <div className="hang" style={{ marginTop: 16 }}>
        {q.quyen.sua && <button className="phu-btn" onClick={() => moSua().catch((e: Error) => setLoi(e.message))}>Sửa báo giá</button>}
        {q.quyen.gui && <button onClick={() => lam(() => api(`/bao-gia/${id}/gui`, { method: 'POST' }), 'Đã đánh dấu là đã gửi cho đối tác.')}>Đánh dấu đã gửi</button>}
        {q.quyen.chapNhan && <button onClick={() => setMo(mo === 'chapNhan' ? '' : 'chapNhan')}>Đối tác chấp nhận</button>}
        {q.quyen.tuChoi && <button className="phu-btn" onClick={() => setMo(mo === 'tuChoi' ? '' : 'tuChoi')}>Đối tác từ chối</button>}
        {q.quyen.suaDoi && <button className="phu-btn" onClick={() => lam(() => api(`/bao-gia/${id}/sua-doi`, { method: 'POST' }), 'Đã mở bản sửa đổi để chỉnh giá.')}>Lập sửa đổi</button>}
        {q.quyen.huy && <button className="phu-btn" onClick={() => setMo(mo === 'huy' ? '' : 'huy')}>Huỷ báo giá</button>}
      </div>
      {q.kind === 'ban' && q.status === 'da_gui' && !q.sourceQuoteId && <p className="kyc-canh-bao">Chọn báo giá mua làm nguồn (sửa đổi báo giá) để có thể chấp nhận và sinh hợp đồng.</p>}

      {mo === 'sua' && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); lam(() => api(`/bao-gia/${id}`, { method: 'PUT', body: v }), 'Đã lưu báo giá.'); }}>
          <ONhapBaoGia loai={q.kind} v={v} doi={setV} chon={chon} />
          <button style={{ marginTop: 16 }}>Lưu</button>
        </form>
      )}

      {mo === 'chapNhan' && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); lam(() => api(`/bao-gia/${id}/chap-nhan`, { body: { loaiGiaoDich: loaiGd } }), 'Đã sinh hợp đồng nháp. Mở hợp đồng bên dưới để rà soát và trình ký.'); }}>
          {q.kind === 'ban' ? (
            <>
              <label htmlFor="lgd">Loại giao dịch</label>
              <select id="lgd" value={loaiGd} onChange={(e) => setLoaiGd(e.target.value)}>
                <option value="mua_dut">Mua đứt bán lại: sinh hợp đồng mua (với nhà cung cấp) và hợp đồng bán (với người mua)</option>
                <option value="moi_gioi">Môi giới: sinh hợp đồng mua bán trực tiếp và hợp đồng dịch vụ môi giới</option>
              </select>
            </>
          ) : (
            <p>Sinh một hợp đồng mua nháp với {q.partnerName}.</p>
          )}
          <p className="phu">Nhà cung cấp và người mua phải đã thẩm định đạt thì mới sinh được hợp đồng.</p>
          <button style={{ marginTop: 12 }}>Xác nhận và sinh hợp đồng</button>
        </form>
      )}

      {(mo === 'tuChoi' || mo === 'huy') && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); lam(() => api(`/bao-gia/${id}/${mo === 'tuChoi' ? 'tu-choi' : 'huy'}`, { body: { lyDo } }), mo === 'tuChoi' ? 'Đã ghi nhận đối tác từ chối.' : 'Đã huỷ báo giá.'); }}>
          <label htmlFor="ld">{mo === 'tuChoi' ? 'Lý do đối tác từ chối' : 'Lý do huỷ'}</label>
          <input id="ld" required minLength={3} value={lyDo} onChange={(e) => setLyDo(e.target.value)} />
          <button style={{ marginTop: 12 }}>Xác nhận</button>
        </form>
      )}

      {q.hopDong.length > 0 && (
        <>
          <h2>Hợp đồng sinh ra</h2>
          <div className="bang-cuon">
            <table>
              <thead><tr><th>Số hợp đồng</th><th>Loại</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {q.hopDong.map((h) => (
                  <tr key={h.id}><td><Link href={`/hop-dong/${h.id}`}>{h.code}</Link></td><td>{LOAI_HOP_DONG_NGAN[h.kind] ?? h.kind}</td><td><NhanTrangThai s={h.status} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </KhungTrang>
  );
}
