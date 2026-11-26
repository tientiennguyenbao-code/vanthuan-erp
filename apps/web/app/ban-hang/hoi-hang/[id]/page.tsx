'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BangMau, HoiHang, LY_DO_THUA, Mau, NGUON_HOI_HANG, NhanHoiHang } from '@/lib/ban-hang';
import { NhanBaoGia } from '@/lib/bao-gia';
import { ngay, tien } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../../khung-trang';

type ChiTiet = HoiHang & {
  sector: string;
  baoGia: { id: string; code: string; status: string; version: number; unitPrice: number; currency: string; unit: string; quantity: number; validUntil: string }[];
  quyen: { sua: boolean; lapBaoGia: boolean; thua: boolean; huy: boolean; guiMau: boolean };
};

export default function ChiTietHoiHang() {
  const { id } = useParams<{ id: string }>();
  const toi = useToi();
  const [h, setH] = useState<ChiTiet | null>(null);
  const [mau, setMau] = useState<Mau[]>([]);
  const [loi, setLoi] = useState('');
  const [mo, setMo] = useState<'' | 'thua' | 'huy' | 'mau'>('');
  const [thua, setThua] = useState({ lyDo: 'gia', ghiChu: '' });
  const [lyDoHuy, setLyDoHuy] = useState('');
  const [m, setM] = useState({ khoiLuongG: '300', moTa: '' });

  const tai = useCallback(async () => {
    const [a, b] = await Promise.all([api<ChiTiet>(`/hoi-hang/${id}`), api<{ mau: Mau[] }>(`/mau?hoiHangId=${id}`)]);
    setH(a);
    setMau(b.mau);
  }, [id]);
  useEffect(() => {
    if (!toi) return;
    tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  async function lam(e: FormEvent, path: string, body: unknown) {
    e.preventDefault();
    setLoi('');
    try {
      await api(path, { body });
      setMo('');
      await tai();
    } catch (err) {
      setLoi((err as Error).message);
    }
  }

  if (!toi) return null;
  if (!h) return <KhungTrang toi={toi}>{loi ? <div className="loi">{loi}</div> : <p className="phu">Đang tải…</p>}</KhungTrang>;
  const dv = h.unit === 'tan' ? 'tấn' : 'kg';
  return (
    <KhungTrang toi={toi}>
      <p className="phu"><Link href="/ban-hang/hoi-hang">← Hỏi hàng</Link></p>
      <h1>{h.code} · {h.partnerName}</h1>
      <p><NhanHoiHang s={h.status} quaHan={h.quaHan} />{h.status === 'moi' && <span className="phu"> · cần gửi báo giá trước hết ngày {ngay(h.hanBaoGia)}</span>}</p>
      {h.status === 'thua' && <div className="loi">Thua vì {LY_DO_THUA[h.lostReason ?? ''] ?? h.lostReason}{h.closeNote ? `: ${h.closeNote}` : ''}</div>}
      {h.status === 'thang' && <div className="dat">{h.closeNote}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}

      <div className="luoi" style={{ marginTop: 16 }}>
        <div className="o">
          <div className="phu">Yêu cầu</div>
          <div><strong>{h.commodityName}</strong></div>
          <div>{tien(h.quantity)} {dv}{h.deliveryMonth ? ` · giao tháng ${h.deliveryMonth}` : ''}</div>
          <div>{h.incoterms ?? '—'}{h.portTo ? ` ${h.portTo}` : ''}</div>
          {h.certifications && <div>Chứng nhận: {h.certifications}</div>}
        </div>
        <div className="o">
          <div className="phu">Giá mục tiêu của người mua</div>
          <div className="so-lon">{h.targetPrice ? tien(h.targetPrice, h.currency ?? 'USD') : '—'}</div>
          {h.targetPrice && <div className="phu">mỗi {dv}</div>}
        </div>
        <div className="o">
          <div className="phu">Nguồn</div>
          <div>{NGUON_HOI_HANG[h.source]}, nhận ngày {ngay(h.receivedOn)}</div>
          <div className="phu">Phụ trách: {h.ownerName}</div>
        </div>
      </div>
      {h.spec && <p><strong>Quy cách:</strong> {h.spec}</p>}
      {h.note && <p className="phu">{h.note}</p>}

      <div className="hang" style={{ marginTop: 12 }}>
        {h.quyen.lapBaoGia && <button onClick={() => { window.location.href = `/bao-gia?hoiHang=${h.id}`; }}>Lập báo giá bán từ phiếu</button>}
        {h.quyen.guiMau && <button className="phu-btn" onClick={() => setMo(mo === 'mau' ? '' : 'mau')}>Gửi mẫu chào hàng</button>}
        {h.quyen.thua && <button className="phu-btn" onClick={() => setMo(mo === 'thua' ? '' : 'thua')}>Đánh dấu thua</button>}
        {h.quyen.huy && <button className="phu-btn" onClick={() => setMo(mo === 'huy' ? '' : 'huy')}>Huỷ phiếu</button>}
      </div>

      {mo === 'thua' && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={(e) => lam(e, `/hoi-hang/${id}/thua`, { lyDo: thua.lyDo, ghiChu: thua.ghiChu || null })}>
          <div className="hang">
            <div><label htmlFor="ld">Lý do thua</label><select id="ld" value={thua.lyDo} onChange={(e) => setThua({ ...thua, lyDo: e.target.value })}>{Object.entries(LY_DO_THUA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
            <div style={{ flexBasis: 400 }}><label htmlFor="gc">Ghi chú</label><input id="gc" value={thua.ghiChu} onChange={(e) => setThua({ ...thua, ghiChu: e.target.value })} placeholder="Ví dụ: đối thủ chào thấp hơn 60 USD/tấn" /></div>
            <button>Lưu</button>
          </div>
        </form>
      )}
      {mo === 'huy' && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={(e) => lam(e, `/hoi-hang/${id}/huy`, { lyDo: lyDoHuy })}>
          <div className="hang"><div style={{ flexBasis: 400 }}><label htmlFor="ldh">Lý do huỷ</label><input id="ldh" required value={lyDoHuy} onChange={(e) => setLyDoHuy(e.target.value)} /></div><button>Huỷ phiếu</button></div>
        </form>
      )}
      {mo === 'mau' && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={(e) => lam(e, '/mau', { loai: 'chao_hang', doiTacId: h.partnerId, matHangId: h.commodityId, hoiHangId: h.id, khoiLuongG: m.khoiLuongG ? Number(m.khoiLuongG) : null, moTa: m.moTa || null })}>
          <div className="hang">
            <div><label htmlFor="kl">Khối lượng mẫu (g)</label><input id="kl" inputMode="numeric" value={m.khoiLuongG} onChange={(e) => setM({ ...m, khoiLuongG: e.target.value })} /></div>
            <div style={{ flexBasis: 400 }}><label htmlFor="mt">Mô tả mẫu</label><input id="mt" value={m.moTa} onChange={(e) => setM({ ...m, moTa: e.target.value })} placeholder="Lô, vụ, quy cách" /></div>
            <button>Tạo mẫu</button>
          </div>
        </form>
      )}

      <h2 style={{ marginTop: 24 }}>Báo giá đã lập</h2>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Số</th><th>Số lượng</th><th>Đơn giá</th><th>Hiệu lực đến</th><th>Trạng thái</th></tr></thead>
          <tbody>
            {h.baoGia.map((q) => (
              <tr key={q.id}>
                <td><Link href={`/bao-gia/${q.id}`}>{q.code}</Link>{q.version > 1 && <span className="phu"> · sửa đổi {q.version - 1}</span>}</td>
                <td>{tien(q.quantity)} {q.unit === 'tan' ? 'tấn' : 'kg'}</td>
                <td>{tien(q.unitPrice, q.currency)}</td>
                <td>{ngay(q.validUntil)}</td>
                <td><NhanBaoGia s={q.status} /></td>
              </tr>
            ))}
            {h.baoGia.length === 0 && <tr><td colSpan={5} className="phu">Chưa có báo giá.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 24 }}>Mẫu hàng</h2>
      <BangMau ds={mau} taiLai={() => tai().catch((e: Error) => setLoi(e.message))} coCot={false} />
    </KhungTrang>
  );
}
