'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DieuKhoan, NhanTrangThai, NhapDieuKhoan } from '@/lib/hop-dong';
import { LOAI_HOP_DONG, ngayGio, SU_KIEN_SO_CAI, tien } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface ChiTiet {
  id: string;
  code: string;
  kind: string;
  dealType: string;
  status: string;
  sellerName: string | null;
  buyerName: string | null;
  commodityName: string;
  ownerName: string;
  currentVersion: number;
  signedVersion: number | null;
  cancelReason: string | null;
  terms: DieuKhoan;
  giaTri: number;
  giaTriUsd: number | null;
  thieuSot: string[];
  versions: { version: number; contentHash: string; maXacMinh: string; reason: string | null; submittedAt: string | null; submittedByName: string | null; signedAt: string | null; signedByName: string | null }[];
  ledger: { id: number; at: string; version: number; event: string; contentHash: string; note: string | null; hash: string; actorName: string; signature: { provider: string } | null }[];
  quyen: { sua: boolean; trinhKy: boolean; ky: boolean; traLai: boolean; phuLuc: boolean; huy: boolean };
}

type Hop = '' | 'sua' | 'ky' | 'traLai' | 'phuLuc' | 'huy';

export default function ChiTietHopDong() {
  const toi = useToi();
  const { id } = useParams<{ id: string }>();
  const [hd, setHd] = useState<ChiTiet | null>(null);
  const [loi, setLoi] = useState('');
  const [thongBao, setThongBao] = useState('');
  const [mo, setMo] = useState<Hop>('');
  const [dk, setDk] = useState<DieuKhoan | null>(null);
  const [lyDo, setLyDo] = useState('');
  const [ma, setMa] = useState('');

  const tai = useCallback(async () => {
    const r = await api<ChiTiet>(`/hop-dong/${id}`);
    setHd(r);
    setDk(r.terms);
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
      setMa('');
      await tai();
      setThongBao(xong);
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  if (!toi) return null;
  if (!hd || !dk) return <KhungTrang toi={toi}>{loi ? <div className="loi">{loi}</div> : <p className="phu">Đang tải…</p>}</KhungTrang>;

  const t = hd.terms;
  const phienBanHienTai = hd.versions.find((v) => v.version === hd.currentVersion)!;
  const banDaKy = hd.signedVersion ? hd.versions.find((v) => v.version === hd.signedVersion) : null;

  return (
    <KhungTrang toi={toi}>
      <p><Link href="/hop-dong">← Hợp đồng</Link></p>
      <h1>{hd.code} <span style={{ fontSize: 16 }}><NhanTrangThai s={hd.status} /></span></h1>
      <p className="phu">
        {LOAI_HOP_DONG[hd.kind]} · {hd.dealType === 'mua_dut' ? 'Mua đứt bán lại' : 'Môi giới'} · phiên bản {hd.currentVersion}
        {hd.currentVersion > 1 && ' (phụ lục)'} · phụ trách: {hd.ownerName}
      </p>
      {hd.status === 'da_huy' && <div className="loi">Đã huỷ: {hd.cancelReason}</div>}
      {thongBao && <div className="dat" role="status">{thongBao}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}

      <div className="luoi" style={{ marginTop: 16 }}>
        <div className="o">
          <strong>Các bên</strong>
          <div>Bên bán: {hd.sellerName ?? 'Công ty TNHH Vạn Thuận Global'}</div>
          <div>Bên mua: {hd.buyerName ?? (hd.kind === 'moi_gioi' ? 'Chưa xác định' : 'Công ty TNHH Vạn Thuận Global')}</div>
          <div>Mặt hàng: {hd.commodityName}</div>
        </div>
        <div className="o">
          <strong>Giá trị</strong>
          <div style={{ fontSize: 20 }}>{tien(hd.giaTri, t.tienTe)}</div>
          {t.tienTe !== 'USD' && <div className="phu">≈ {tien(hd.giaTriUsd, 'USD')} (tỷ giá {tien(t.tyGiaUsd)})</div>}
          {t.tyLePhiPhanTram !== null && <div className="phu">Phí trọn gói {t.tyLePhiPhanTram}%</div>}
        </div>
        <div className="o">
          <strong>Mã xác minh</strong>
          {banDaKy ? (
            <>
              <div className="phu">Bản đã ký (phiên bản {banDaKy.version}), gửi cho đối tác để tự kiểm tra:</div>
              <code style={{ wordBreak: 'break-all', fontSize: 12 }}>{banDaKy.maXacMinh}</code>
              <div><Link href={`/xac-minh?ma=${banDaKy.maXacMinh}`}>Mở trang xác minh</Link></div>
            </>
          ) : (
            <div className="phu">Có sau khi hợp đồng được ký.</div>
          )}
        </div>
      </div>

      <h2>Điều khoản (phiên bản {hd.currentVersion})</h2>
      <div className="bang-cuon">
        <table>
          <tbody>
            <tr><th>Số lượng</th><td>{tien(t.soLuong)} {t.donVi === 'tan' ? 'tấn' : 'kg'} (dung sai ±{t.dungSaiPhanTram}%)</td></tr>
            <tr><th>Đơn giá</th><td>{tien(t.donGia, t.tienTe)} / {t.donVi === 'tan' ? 'tấn' : 'kg'}</td></tr>
            <tr><th>Incoterms, cảng</th><td>{t.incoterms}{t.cangDi && ` · đi ${t.cangDi}`}{t.cangDen && ` · đến ${t.cangDen}`}</td></tr>
            <tr><th>Lịch giao</th><td>{t.lichGiao || '—'}</td></tr>
            <tr><th>Thanh toán</th><td>{t.dieuKhoanThanhToan || '—'}</td></tr>
            <tr><th>Ghi chú, quy cách</th><td style={{ whiteSpace: 'pre-wrap' }}>{t.ghiChu || '—'}</td></tr>
            {phienBanHienTai.reason && <tr><th>Lý do phụ lục</th><td>{phienBanHienTai.reason}</td></tr>}
          </tbody>
        </table>
      </div>
      {hd.status === 'nhap' && hd.thieuSot.length > 0 && <div className="loi">Cần bổ sung trước khi trình ký: {hd.thieuSot.join('; ')}</div>}

      <div className="hang" style={{ marginTop: 16 }}>
        {hd.quyen.sua && <button className="phu-btn" onClick={() => setMo(mo === 'sua' ? '' : 'sua')}>Sửa điều khoản</button>}
        {hd.quyen.trinhKy && <button onClick={() => lam(() => api(`/hop-dong/${id}/trinh-ky`, { method: 'POST' }), 'Đã trình ký. Nội dung được khoá cho tới khi ký hoặc bị trả lại.')}>Trình ký</button>}
        {hd.quyen.ky && <button onClick={() => setMo(mo === 'ky' ? '' : 'ky')}>Ký hợp đồng</button>}
        {hd.quyen.traLai && <button className="phu-btn" onClick={() => setMo(mo === 'traLai' ? '' : 'traLai')}>Trả lại để sửa</button>}
        {hd.quyen.phuLuc && <button className="phu-btn" onClick={() => setMo(mo === 'phuLuc' ? '' : 'phuLuc')}>Lập phụ lục</button>}
        {hd.quyen.huy && <button className="phu-btn" onClick={() => setMo(mo === 'huy' ? '' : 'huy')}>Huỷ hợp đồng</button>}
      </div>

      {(mo === 'sua' || mo === 'phuLuc') && (
        <form
          className="o"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (mo === 'sua') lam(() => api(`/hop-dong/${id}/dieu-khoan`, { method: 'PUT', body: dk }), 'Đã lưu điều khoản và ghi vào sổ cái.');
            else lam(() => api(`/hop-dong/${id}/phu-luc`, { body: { lyDo, dieuKhoan: dk } }), 'Đã tạo phụ lục. Bản đã ký trước vẫn có hiệu lực cho tới khi phụ lục được ký.');
          }}
        >
          {mo === 'phuLuc' && (
            <>
              <label htmlFor="ldpl">Lý do lập phụ lục</label>
              <input id="ldpl" required minLength={3} value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder="VD: Giảm giá do giám định độ ẩm 13%" />
            </>
          )}
          <NhapDieuKhoan v={dk} doi={setDk} />
          <button style={{ marginTop: 16 }}>{mo === 'sua' ? 'Lưu điều khoản' : 'Tạo phụ lục'}</button>
        </form>
      )}

      {mo === 'ky' && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); lam(() => api(`/hop-dong/${id}/ky`, { body: { ma2Lop: ma } }), 'Đã ký. Sổ cái đã ghi chữ ký và mã gốc đã được neo.'); }}>
          <p>Anh/chị đang ký <strong>phiên bản {hd.currentVersion}</strong> với giá trị <strong>{tien(hd.giaTri, t.tienTe)}</strong>. Mã băm của bản này:</p>
          <code style={{ wordBreak: 'break-all', fontSize: 12 }}>{phienBanHienTai.contentHash}</code>
          <label htmlFor="ma2">Nhập mã 6 số trong ứng dụng xác thực để xác nhận</label>
          <input id="ma2" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={ma} onChange={(e) => setMa(e.target.value)} />
          <p className="phu">Chữ ký hiện là chữ ký nội bộ tạm thời; sẽ thay bằng chữ ký số MISA eSign khi công ty có hợp đồng dịch vụ.</p>
          <button>Xác nhận ký</button>
        </form>
      )}

      {(mo === 'traLai' || mo === 'huy') && (
        <form
          className="o"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (mo === 'traLai') lam(() => api(`/hop-dong/${id}/tra-lai`, { body: { lyDo } }), 'Đã trả lại cho người soạn.');
            else lam(() => api(`/hop-dong/${id}/huy`, { body: { lyDo } }), 'Đã huỷ hợp đồng.');
          }}
        >
          <label htmlFor="ld">{mo === 'traLai' ? 'Cần sửa gì' : 'Lý do huỷ'}</label>
          <input id="ld" required minLength={3} value={lyDo} onChange={(e) => setLyDo(e.target.value)} />
          <button style={{ marginTop: 12 }}>{mo === 'traLai' ? 'Trả lại' : 'Xác nhận huỷ'}</button>
        </form>
      )}

      <h2>Các phiên bản</h2>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Phiên bản</th><th>Trình ký</th><th>Ký</th><th>Mã băm</th></tr></thead>
          <tbody>
            {hd.versions.map((v) => (
              <tr key={v.version}>
                <td>{v.version === 1 ? 'Gốc' : `Phụ lục ${v.version - 1}`}{v.reason && <div className="phu">{v.reason}</div>}</td>
                <td>{v.submittedAt ? <>{v.submittedByName}<div className="phu">{ngayGio(v.submittedAt)}</div></> : '—'}</td>
                <td>{v.signedAt ? <>{v.signedByName}<div className="phu">{ngayGio(v.signedAt)}</div></> : '—'}</td>
                <td><code style={{ fontSize: 12 }}>{v.contentHash.slice(0, 16)}…</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Sổ cái của hợp đồng</h2>
      <p className="phu">Mỗi dòng mang mã băm của dòng trước; sửa lén một dòng sẽ làm gãy chuỗi và bị phát hiện ngay.</p>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Lúc</th><th>Việc</th><th>Người làm</th><th>Phiên bản</th><th>Ghi chú</th><th>Mã bản ghi</th></tr></thead>
          <tbody>
            {hd.ledger.map((l) => (
              <tr key={l.id}>
                <td>{ngayGio(l.at)}</td>
                <td>{SU_KIEN_SO_CAI[l.event] ?? l.event}{l.signature && <div className="phu">có chữ ký</div>}</td>
                <td>{l.actorName}</td>
                <td>{l.version}</td>
                <td>{l.event === 'ky' ? '' : l.note ?? ''}</td>
                <td><code style={{ fontSize: 12 }}>{l.hash.slice(0, 12)}…</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </KhungTrang>
  );
}
