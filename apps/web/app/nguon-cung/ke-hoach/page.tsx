'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { kg } from '@/lib/lo-hang';
import { NGANH } from '@/lib/nhan';
import { thangVn } from '@/lib/uoc-tinh';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface Dong { thang: string; cungUocTinhKg: number; cungUocTinhEuKg: number; cauBaoGiaKg: number; cauHopDongKg: number; cauEuKg: number; conLaiKg: number; conLaiEuKg: number }
interface KeHoach {
  nganh: string;
  apDungEudr: boolean;
  thang: string[];
  hangDangCo: { tongKg: number; duEudrKg: number | null; soLo: number };
  thuaChuaUocTinh: number;
  bang: Dong[];
  nguon: { nhaCungCap: string; kg: number; euKg: number | null }[];
  cau: { loai: string; ma: string | null; doiTac: string; thiTruong: string; thang: string; thangGhi: string | null; khoiLuongKg: number }[];
}

const LOAI_CAU: Record<string, string> = { bao_gia: 'Báo giá đang chào', hop_dong_nhap: 'Hợp đồng chưa ký', hop_dong_ky: 'Hợp đồng đã ký' };
const THI_TRUONG: Record<string, string> = { EU: 'EU', US: 'Mỹ', CN: 'Trung Quốc', KHAC: 'Khác' };
const tan = (v: number) => `${(v / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tấn`;
const so = (v: number) => (v ? (v / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '');

/**
 * Kế hoạch thu mua: mỗi tháng có bao nhiêu hàng (đang có + ước tính thu hoạch) so với số đã chào bán và đã ký.
 * Thiếu thì thu mua tìm thêm nguồn; thừa thì kinh doanh còn hàng để chào. Với cà phê, cầu đi EU chỉ dùng được hàng đủ EUDR.
 */
export default function KeHoachThuMua() {
  const toi = useToi();
  const [nganh, setNganh] = useState('ca_phe');
  const [d, setD] = useState<KeHoach | null>(null);
  const [loi, setLoi] = useState('');

  useEffect(() => {
    if (!toi) return;
    setLoi('');
    api<KeHoach>(`/ke-hoach-thu-mua?nganh=${nganh}`).then(setD).catch((e: Error) => setLoi(e.message));
  }, [toi, nganh]);

  if (!toi) return null;
  const cuoi = d?.bang[d.bang.length - 1];
  const thangThieu = d?.bang.find((r) => r.conLaiKg < 0);
  const thangThieuEu = d?.apDungEudr ? d.bang.find((r) => r.conLaiEuKg < 0) : undefined;

  return (
    <KhungTrang toi={toi}>
      <p><Link href="/nguon-cung">← Nguồn cung</Link></p>
      <h1>Kế hoạch thu mua</h1>
      <p className="phu">
        Cung gồm hàng đang có trong các lô mua (chưa phân bổ sang lô xuất) và sản lượng ước tính của các thửa. Cầu gồm báo giá bán đã gửi còn hiệu lực và hợp đồng bán chưa xếp tàu.
        Cầu chưa ghi tháng giao, hoặc đã quá tháng, được tính vào tháng này. Số liệu tính bằng tấn và cộng dồn theo tháng.
      </p>
      <div className="hang" style={{ maxWidth: 320 }}>
        <div>
          <label htmlFor="kh-nganh">Ngành</label>
          <select id="kh-nganh" value={nganh} onChange={(e) => { setD(null); setNganh(e.target.value); }}>
            {Object.entries(NGANH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {!d && !loi && <p className="phu">Đang tải…</p>}
      {d && cuoi && (
        <>
          <div className="luoi" style={{ marginTop: 12 }}>
            <div className="o">
              <div className="phu">Hàng đang có</div>
              <div className="so-lon">{tan(d.hangDangCo.tongKg)}</div>
              <div className="phu">{d.hangDangCo.soLo} lô mua{d.hangDangCo.duEudrKg !== null && `, trong đó đủ EUDR ${tan(d.hangDangCo.duEudrKg)}`}</div>
            </div>
            <div className={`o${cuoi.conLaiKg < 0 ? ' canh-bao-nhe' : ''}`}>
              <div className="phu">Còn lại sau 12 tháng</div>
              <div className="so-lon">{tan(cuoi.conLaiKg)}</div>
              <div className="phu">{thangThieu ? `Bắt đầu thiếu từ tháng ${thangVn(thangThieu.thang)}` : 'Không tháng nào thiếu hàng'}</div>
            </div>
            {d.apDungEudr && (
              <div className={`o${cuoi.conLaiEuKg < 0 ? ' canh-bao-nhe' : ''}`}>
                <div className="phu">Hàng đủ EUDR còn trống cho EU</div>
                <div className="so-lon">{tan(cuoi.conLaiEuKg)}</div>
                <div className="phu">{thangThieuEu ? `Cầu đi EU vượt hàng đủ EUDR từ tháng ${thangVn(thangThieuEu.thang)}` : 'Đủ hàng cho mọi cầu đi EU'}</div>
              </div>
            )}
          </div>
          {d.thuaChuaUocTinh > 0 && (
            <p className="canh-bao-nhe">{d.thuaChuaUocTinh} thửa của ngành này chưa có sản lượng ước tính trong 12 tháng tới, nên cung có thể đang thấp hơn thực tế. Ghi ước tính ở hồ sơ nguồn cung của từng nhà cung cấp.</p>
          )}

          <h2>Theo tháng (tấn)</h2>
          <div className="bang-cuon">
            <table>
              <thead>
                <tr>
                  <th>Tháng</th>
                  <th className="so">Ước tính thu hoạch</th>
                  {d.apDungEudr && <th className="so">trong đó đủ EUDR</th>}
                  <th className="so">Báo giá đang chào</th>
                  <th className="so">Hợp đồng</th>
                  {d.apDungEudr && <th className="so">trong đó đi EU</th>}
                  <th className="so">Còn lại cộng dồn</th>
                  {d.apDungEudr && <th className="so">Còn lại đủ EUDR</th>}
                </tr>
              </thead>
              <tbody>
                {d.bang.map((r) => (
                  <tr key={r.thang} className={r.conLaiKg < 0 || (d.apDungEudr && r.conLaiEuKg < 0) ? 'thieu' : ''}>
                    <td>{thangVn(r.thang)}</td>
                    <td className="so">{so(r.cungUocTinhKg)}</td>
                    {d.apDungEudr && <td className="so">{so(r.cungUocTinhEuKg)}</td>}
                    <td className="so">{so(r.cauBaoGiaKg)}</td>
                    <td className="so">{so(r.cauHopDongKg)}</td>
                    {d.apDungEudr && <td className="so">{so(r.cauEuKg)}</td>}
                    <td className={`so${r.conLaiKg < 0 ? ' canh-bao-nhe' : ''}`}><strong>{(r.conLaiKg / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</strong></td>
                    {d.apDungEudr && <td className={`so${r.conLaiEuKg < 0 ? ' canh-bao-nhe' : ''}`}><strong>{(r.conLaiEuKg / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</strong></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.apDungEudr && <p className="phu">Cà phê đi EU chỉ dùng được hàng đủ EUDR; cà phê đi Mỹ và Trung Quốc dùng được cả hai loại. Ước tính chỉ được tính là đủ EUDR khi thửa đã có kết quả kiểm tra rừng &quot;không rừng&quot; được duyệt và vùng đã có mức năng suất tối đa.</p>}

          <h2>Cầu chi tiết</h2>
          <div className="bang-cuon">
            <table>
              <thead><tr><th>Loại</th><th>Số</th><th>Người mua</th><th>Thị trường</th><th>Tháng tính</th><th className="so">Khối lượng</th></tr></thead>
              <tbody>
                {d.cau.length === 0 && <tr><td colSpan={6} className="phu">Chưa có báo giá đang chào hay hợp đồng bán nào chưa giao.</td></tr>}
                {d.cau.map((c, i) => (
                  <tr key={`${c.ma}-${i}`}>
                    <td>{LOAI_CAU[c.loai]}</td>
                    <td>{c.ma ?? <span className="phu">—</span>}</td>
                    <td>{c.doiTac}</td>
                    <td>{THI_TRUONG[c.thiTruong]}</td>
                    <td>{thangVn(c.thang)}{c.thangGhi !== c.thang && <div className="phu">{c.thangGhi ? `ghi ${thangVn(c.thangGhi)}, đã quá` : 'chưa ghi tháng giao'}</div>}</td>
                    <td className="so">{kg(c.khoiLuongKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Nguồn ước tính theo nhà cung cấp</h2>
          <div className="bang-cuon">
            <table>
              <thead><tr><th>Nhà cung cấp</th><th className="so">Ước tính 12 tháng</th>{d.apDungEudr && <th className="so">trong đó đủ EUDR</th>}</tr></thead>
              <tbody>
                {d.nguon.length === 0 && <tr><td colSpan={3} className="phu">Chưa có ước tính nào.</td></tr>}
                {d.nguon.map((n) => (
                  <tr key={n.nhaCungCap}>
                    <td>{n.nhaCungCap}</td>
                    <td className="so">{kg(n.kg)}</td>
                    {d.apDungEudr && <td className="so">{kg(n.euKg)}</td>}
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
