'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { usd } from '@/lib/cong-no';
import { THI_TRUONG } from '@/lib/lo-hang';
import { NGANH } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface Bucket {
  hopDong: { so: number; giaTriUsd: number };
  giaoHang: { soLo: number; kg: number; giaTriUsd: number };
}
interface Thang extends Bucket {
  thang: string;
  hoiHang: { tong: number; thang: number; thua: number };
  baoGia: { daGui: number; chapNhan: number; tuChoi: number };
}
interface Nhom extends Bucket { ma: string; ten: string }
interface BaoCao {
  tuThang: string;
  denThang: string;
  thang: Thang[];
  tong: Bucket & {
    hoiHang: { tong: number; thang: number; thua: number; tyLeThangPhanTram: number | null };
    baoGia: { daGui: number; chapNhan: number; tuChoi: number; tyLeThangPhanTram: number | null };
  };
  theoNganh: Nhom[];
  theoThiTruong: Nhom[];
  theoNguoiMua: Nhom[];
  thieuTyGia: number;
}

const tan = (kg: number) => `${(kg / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tấn`;
const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('vi-VN')}%`);
const thangVn = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;

function BangNhom({ tieuDe, ds, nhan }: { tieuDe: string; ds: Nhom[]; nhan?: Record<string, string> }) {
  return (
    <>
      <h2>{tieuDe}</h2>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>{tieuDe.replace('Theo ', '').replace(/^./, (c) => c.toUpperCase())}</th><th>Hợp đồng ký</th><th>Giá trị ký</th><th>Lô đã giao</th><th>Khối lượng giao</th><th>Giá trị giao</th></tr></thead>
          <tbody>
            {ds.map((x) => (
              <tr key={x.ma}>
                <td>{nhan?.[x.ma] ?? (x.ma === 'khac' ? 'Khác' : x.ten)}</td>
                <td>{x.hopDong.so}</td>
                <td>{usd(x.hopDong.giaTriUsd)}</td>
                <td>{x.giaoHang.soLo}</td>
                <td>{tan(x.giaoHang.kg)}</td>
                <td>{usd(x.giaoHang.giaTriUsd)}</td>
              </tr>
            ))}
            {ds.length === 0 && <tr><td colSpan={6} className="phu">Chưa có số liệu trong kỳ.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function BaoCaoKinhDoanh() {
  const toi = useToi();
  const [tu, setTu] = useState('');
  const [den, setDen] = useState('');
  const [d, setD] = useState<BaoCao | null>(null);
  const [loi, setLoi] = useState('');
  function tai(t?: string, n?: string) {
    setLoi('');
    const q = new URLSearchParams();
    if (t) q.set('tuThang', t);
    if (n) q.set('denThang', n);
    api<BaoCao>(`/bao-cao-kinh-doanh${q.size ? `?${q}` : ''}`)
      .then((r) => {
        setD(r);
        setTu(r.tuThang);
        setDen(r.denThang);
      })
      .catch((e: Error) => setLoi(e.message));
  }
  useEffect(() => {
    if (toi) tai();
  }, [toi]);
  if (!toi) return null;
  const max = d ? Math.max(1, ...d.thang.map((t) => Math.max(t.hopDong.giaTriUsd, t.giaoHang.giaTriUsd))) : 1;
  return (
    <KhungTrang toi={toi}>
      <h1>Báo cáo kinh doanh</h1>
      <p className="phu">Hợp đồng bán đã ký (mua đứt và môi giới) tính theo tháng ký; hàng đã giao tính theo tháng tàu chạy. Giá trị quy USD theo tỷ giá ghi trên hợp đồng; giá trừ lùi dùng giá bình quân đã chốt.</p>
      <form className="hang" onSubmit={(e) => { e.preventDefault(); tai(tu, den); }}>
        <div><label htmlFor="tu">Từ tháng</label><input id="tu" type="month" value={tu} onChange={(e) => setTu(e.target.value)} /></div>
        <div><label htmlFor="den">Đến tháng</label><input id="den" type="month" value={den} onChange={(e) => setDen(e.target.value)} /></div>
        <button>Xem</button>
      </form>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {d && (
        <>
          <div className="luoi" style={{ marginTop: 16 }}>
            <div className="o"><div className="phu">Hợp đồng bán đã ký</div><strong style={{ fontSize: 22 }}>{usd(d.tong.hopDong.giaTriUsd)}</strong><div className="phu">{d.tong.hopDong.so} hợp đồng</div></div>
            <div className="o"><div className="phu">Hàng đã giao</div><strong style={{ fontSize: 22 }}>{tan(d.tong.giaoHang.kg)}</strong><div className="phu">{usd(d.tong.giaoHang.giaTriUsd)} · {d.tong.giaoHang.soLo} lô</div></div>
            <div className="o"><div className="phu">Tỷ lệ thắng hỏi hàng</div><strong style={{ fontSize: 22 }}>{pct(d.tong.hoiHang.tyLeThangPhanTram)}</strong><div className="phu">{d.tong.hoiHang.thang} thắng, {d.tong.hoiHang.thua} thua / {d.tong.hoiHang.tong} phiếu</div></div>
            <div className="o"><div className="phu">Tỷ lệ chấp nhận báo giá</div><strong style={{ fontSize: 22 }}>{pct(d.tong.baoGia.tyLeThangPhanTram)}</strong><div className="phu">{d.tong.baoGia.chapNhan} chấp nhận, {d.tong.baoGia.tuChoi} từ chối / {d.tong.baoGia.daGui} đã gửi</div></div>
          </div>
          {d.thieuTyGia > 0 && <p className="kyc-canh-bao">{d.thieuTyGia} hợp đồng hoặc lô chưa có tỷ giá nên chưa tính vào giá trị.</p>}

          <h2>Theo tháng</h2>
          <div className="bang-cuon">
            <table>
              <thead><tr><th>Tháng</th><th>Hợp đồng ký</th><th>Giá trị ký</th><th>Giao hàng</th><th>Giá trị giao</th><th style={{ width: 180 }}></th><th>Hỏi hàng (thắng/thua)</th><th>Báo giá (nhận/từ chối)</th></tr></thead>
              <tbody>
                {d.thang.map((t) => (
                  <tr key={t.thang}>
                    <td>{thangVn(t.thang)}</td>
                    <td>{t.hopDong.so || '—'}</td>
                    <td>{t.hopDong.giaTriUsd ? usd(t.hopDong.giaTriUsd) : '—'}</td>
                    <td>{t.giaoHang.soLo ? `${t.giaoHang.soLo} lô · ${tan(t.giaoHang.kg)}` : '—'}</td>
                    <td>{t.giaoHang.giaTriUsd ? usd(t.giaoHang.giaTriUsd) : '—'}</td>
                    <td aria-hidden="true">
                      <div title="Giá trị ký" style={{ height: 6, background: 'var(--chinh)', width: `${(t.hopDong.giaTriUsd / max) * 100}%`, borderRadius: 3, marginBottom: 3 }} />
                      <div title="Giá trị giao" style={{ height: 6, background: 'var(--vang)', width: `${(t.giaoHang.giaTriUsd / max) * 100}%`, borderRadius: 3 }} />
                    </td>
                    <td>{t.hoiHang.tong ? `${t.hoiHang.tong} phiếu (${t.hoiHang.thang}/${t.hoiHang.thua})` : '—'}</td>
                    <td>{t.baoGia.daGui ? `${t.baoGia.daGui} (${t.baoGia.chapNhan}/${t.baoGia.tuChoi})` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="phu" style={{ fontSize: 13 }}>Thanh xanh: giá trị ký. Thanh vàng: giá trị giao.</p>

          <BangNhom tieuDe="Theo ngành" ds={d.theoNganh} nhan={NGANH} />
          <BangNhom tieuDe="Theo thị trường" ds={d.theoThiTruong} nhan={THI_TRUONG} />
          <BangNhom tieuDe="Theo người mua" ds={d.theoNguoiMua} />
        </>
      )}
    </KhungTrang>
  );
}
