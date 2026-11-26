'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { NHOM_TUOI_NO, THU_TU_NHOM, TRANG_THAI_HAN_MUC, TuoiNo, usd } from '@/lib/cong-no';
import { ngay, ngayGio, tien } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../../khung-trang';

const MOC: Record<string, string> = { dat_coc: 'Đặt cọc', giam_dinh: 'Sau giám định', van_don: 'Theo vận đơn', chung_tu: 'Theo chứng từ', ngay: 'Theo ngày' };

interface ChiTiet {
  id: string;
  name: string;
  country: string;
  tuoiNo: TuoiNo;
  duNo: number;
  hanMuc: { amountUsd: number; maxDays: number } | null;
  conLai: number | null;
  biChan: boolean;
  khoanPhaiThu: { id: string; exportLotId: string; lotCode: string; milestone: string; dueDate: string | null; amount: number; currency: string; amountUsd: number | null; soNgayQuaHan: number | null }[];
  hopDongChoLenLich: { id: string; code: string; usd: number | null }[];
  lichSuHanMuc: { id: string; amountUsd: number; maxDays: number; status: string; reason: string; proposedByName: string; proposedAt: string; decidedByName: string | null; decidedAt: string | null; decisionNote: string | null }[];
  quyen: { deXuat: boolean; duyet: boolean };
}

export default function ChiTietCongNo() {
  const toi = useToi();
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<ChiTiet | null>(null);
  const [loi, setLoi] = useState('');
  const [tb, setTb] = useState('');
  const [f, setF] = useState({ hanMucUsd: '', soNgayToiDa: '30', lyDo: '' });
  const [ghiChu, setGhiChu] = useState('');
  const tai = useCallback(() => api<ChiTiet>(`/cong-no/${id}`).then(setD), [id]);
  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  async function lam(fn: () => Promise<unknown>, xong: string) {
    setLoi('');
    setTb('');
    try {
      await fn();
      setTb(xong);
      await tai();
    } catch (e) {
      setLoi((e as Error).message);
    }
  }
  function deXuat(e: FormEvent) {
    e.preventDefault();
    lam(() => api(`/cong-no/${id}/han-muc`, { body: { hanMucUsd: Number(f.hanMucUsd.replace(/[.\s]/g, '')), soNgayToiDa: Number(f.soNgayToiDa), lyDo: f.lyDo } }), 'Đã gửi đề xuất hạn mức cho Giám đốc.');
  }

  if (!toi) return null;
  const cho = d?.lichSuHanMuc.find((h) => h.status === 'de_xuat');
  return (
    <KhungTrang toi={toi}>
      <p><Link href="/ban-hang/cong-no">← Công nợ người mua</Link></p>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {tb && <div className="dat" role="status">{tb}</div>}
      {d && (
        <>
          <h1>{d.name} <span className="phu">{d.country}</span></h1>
          {d.biChan && <div className="loi">Người mua có khoản quá hạn {d.tuoiNo.maxOverdueDays} ngày: không ký thêm hợp đồng trả chậm cho tới khi thu xong.</div>}
          <div className="luoi" style={{ marginTop: 12 }}>
            <div className="o"><div className="phu">Dư nợ</div><div className="so-lon">{usd(d.duNo)}</div></div>
            <div className="o"><div className="phu">Đã quá hạn</div><div className={`so-lon ${d.tuoiNo.overdue ? 'kyc-canh-bao' : ''}`}>{usd(d.tuoiNo.overdue)}</div></div>
            <div className="o"><div className="phu">Hạn mức</div><div className="so-lon">{d.hanMuc ? usd(d.hanMuc.amountUsd) : '0'}</div><div className="phu">{d.hanMuc ? `trả chậm tối đa ${d.hanMuc.maxDays} ngày` : 'chưa có hạn mức được duyệt'}</div></div>
            <div className="o"><div className="phu">Còn được nợ thêm</div><div className={`so-lon ${d.conLai !== null && d.conLai < 0 ? 'kyc-canh-bao' : ''}`}>{d.conLai === null ? '0' : usd(d.conLai)}</div></div>
          </div>

          <h2>Tuổi nợ</h2>
          <div className="bang-cuon">
            <table>
              <thead><tr>{THU_TU_NHOM.map((k) => <th key={k} className="so">{NHOM_TUOI_NO[k]}</th>)}</tr></thead>
              <tbody><tr>{THU_TU_NHOM.map((k) => <td key={k} className={`so ${k.startsWith('qua') && d.tuoiNo.buckets[k] ? 'kyc-canh-bao' : ''}`}>{usd(d.tuoiNo.buckets[k])}</td>)}</tr></tbody>
            </table>
          </div>

          <h2>Các khoản phải thu</h2>
          <div className="bang-cuon">
            <table>
              <thead><tr><th>Lô xuất</th><th>Mốc</th><th>Đến hạn</th><th className="so">Số tiền</th><th className="so">Quá hạn</th></tr></thead>
              <tbody>
                {d.khoanPhaiThu.length === 0 && <tr><td colSpan={5} className="phu">Không có khoản nào chưa thu.</td></tr>}
                {d.khoanPhaiThu.map((k) => (
                  <tr key={k.id}>
                    <td><Link href={`/lo-hang/${k.exportLotId}`}>{k.lotCode}</Link></td>
                    <td>{MOC[k.milestone] ?? k.milestone}</td>
                    <td>{ngay(k.dueDate)}</td>
                    <td className="so">{tien(k.amount, k.currency)}</td>
                    <td className={`so ${k.soNgayQuaHan && k.soNgayQuaHan > 30 ? 'kyc-canh-bao' : ''}`}>{k.soNgayQuaHan && k.soNgayQuaHan > 0 ? `${k.soNgayQuaHan} ngày` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.hopDongChoLenLich.length > 0 && (
            <p>Hợp đồng trả chậm chưa lên lịch thu (tính cả giá trị vào dư nợ): {d.hopDongChoLenLich.map((h, i) => <span key={h.id}>{i > 0 && ', '}<Link href={`/hop-dong/${h.id}`}>{h.code}</Link> ({usd(h.usd)})</span>)}</p>
          )}

          <h2>Hạn mức nợ</h2>
          {cho && d.quyen.duyet && (
            <div className="o">
              <strong>Đề xuất chờ duyệt: {usd(cho.amountUsd)}, trả chậm tối đa {cho.maxDays} ngày</strong>
              <div className="phu">{cho.proposedByName} đề xuất lúc {ngayGio(cho.proposedAt)}: {cho.reason}</div>
              <label htmlFor="gcd">Ghi chú (bắt buộc khi từ chối)</label>
              <input id="gcd" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
              <div className="hang" style={{ marginTop: 8 }}>
                <button onClick={() => lam(() => api(`/cong-no/han-muc/${cho.id}/quyet-dinh`, { body: { dongY: true, ghiChu: ghiChu || null } }), 'Đã duyệt hạn mức.')}>Duyệt</button>
                <button className="phu-btn" onClick={() => lam(() => api(`/cong-no/han-muc/${cho.id}/quyet-dinh`, { body: { dongY: false, ghiChu: ghiChu || null } }), 'Đã từ chối đề xuất.')}>Từ chối</button>
              </div>
            </div>
          )}
          {d.quyen.deXuat && (
            <form className="o" style={{ marginTop: 12 }} onSubmit={deXuat}>
              <strong>Đề xuất hạn mức mới</strong>
              <p className="phu" style={{ margin: '4px 0 0' }}>Giám đốc duyệt xong thì hạn mức mới thay hạn mức cũ. Đặt 0 để ngừng bán trả chậm.</p>
              <div className="hang">
                <div><label htmlFor="hm">Hạn mức (USD)</label><input id="hm" inputMode="numeric" required value={f.hanMucUsd} onChange={(e) => setF({ ...f, hanMucUsd: e.target.value })} /></div>
                <div><label htmlFor="sn">Trả chậm tối đa (ngày)</label><input id="sn" inputMode="numeric" required value={f.soNgayToiDa} onChange={(e) => setF({ ...f, soNgayToiDa: e.target.value })} /></div>
              </div>
              <label htmlFor="ld">Lý do, căn cứ</label>
              <input id="ld" required minLength={3} value={f.lyDo} onChange={(e) => setF({ ...f, lyDo: e.target.value })} placeholder="VD: báo cáo tài chính 2025, lịch sử thanh toán, bảo hiểm tín dụng" />
              <button style={{ marginTop: 12 }}>Gửi Giám đốc duyệt</button>
            </form>
          )}
          <div className="bang-cuon" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>Đề xuất</th><th className="so">Hạn mức</th><th className="so">Số ngày</th><th>Lý do</th><th>Kết quả</th></tr></thead>
              <tbody>
                {d.lichSuHanMuc.length === 0 && <tr><td colSpan={5} className="phu">Chưa có đề xuất nào. Hạn mức đang là 0.</td></tr>}
                {d.lichSuHanMuc.map((h) => (
                  <tr key={h.id}>
                    <td>{h.proposedByName}<div className="phu">{ngayGio(h.proposedAt)}</div></td>
                    <td className="so">{usd(h.amountUsd)}</td>
                    <td className="so">{h.maxDays}</td>
                    <td>{h.reason}</td>
                    <td><span className={h.status === 'da_duyet' ? 'kyc-dat' : h.status === 'tu_choi' ? 'kyc-canh-bao' : ''}>{TRANG_THAI_HAN_MUC[h.status] ?? h.status}</span>{h.decidedByName && <div className="phu">{h.decidedByName}, {ngayGio(h.decidedAt)}{h.decisionNote ? `: ${h.decisionNote}` : ''}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </KhungTrang>
  );
}
