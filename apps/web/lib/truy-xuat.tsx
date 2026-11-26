'use client';

import { useEffect, useState } from 'react';
import { api } from './api';
import { kg } from './lo-hang';
import { NGANH, ngay } from './nhan';

interface Kiem { ma: string; ten: string; dat: boolean; chiTiet: string[]; canXacMinh: boolean }
interface TruyXuat {
  nganh: string; thiTruong: string; mucTruyXuat: string | null; tongKg: number; truyDuocKg: number; dat: boolean;
  kiemTra: Kiem[];
  loMua: { ma: string; nhaCungCap: string; khoiLuongKg: number; nhanEudr: string | null; maCoSoDongGoi: string | null; coSo: string[] }[];
  nguon: { ma: string; loai: string; maHo: string; maVung: string; tenVung: string; maSoVung: string | null; maSoVungHetHan: boolean; cayTrong: string | null; khoiLuongKg: number; thuHoachTu: string; thuHoachDen: string; coNhatKyThuoc: boolean | null; luuY: string[] }[];
  coSo: { ten: string; loai: string; ma: { loai: string; ma: string; hieuLucDen: string | null }[] }[];
}

const THI_TRUONG: Record<string, string> = { EU: 'EU', US: 'Mỹ', CN: 'Trung Quốc' };
const LOAI_MA: Record<string, string> = { fda: 'FDA', gacc: 'GACC', eu_list: 'DS EU' };

/**
 * Truy xuất nguồn gốc của lô xuất (mọi ngành): kiểm theo cặp ngành × thị trường, thửa/ao góp hàng (kg theo phần
 * phân bổ), kho, xưởng đã xử lý hàng và mã đăng ký của chúng.
 */
export function TruyXuatLo({ loId }: { loId: string }) {
  const [d, setD] = useState<TruyXuat | null>(null);
  const [loi, setLoi] = useState('');
  useEffect(() => {
    api<TruyXuat>(`/lo-xuat/${loId}/truy-xuat`).then(setD).catch((e: Error) => setLoi(e.message));
  }, [loId]);

  if (loi) return <div className="loi">{loi}</div>;
  if (!d) return <p className="phu">Đang tải truy xuất…</p>;
  const ty = d.tongKg > 0 ? Math.round((d.truyDuocKg / d.tongKg) * 100) : 0;

  return (
    <section>
      <p className="phu">
        {NGANH[d.nganh]} sang {THI_TRUONG[d.thiTruong] ?? d.thiTruong}
        {d.mucTruyXuat ? <> · mức truy xuất tối thiểu: <strong>{d.mucTruyXuat}</strong></> : ' · chưa có quy tắc cho thị trường này'}
        {' '}· truy được {kg(d.truyDuocKg)} / {kg(d.tongKg)} ({ty}%) tới thửa hoặc ao.
      </p>
      {d.kiemTra.length > 0 && (
        <div className="o" style={{ marginBottom: 12 }}>
          <strong>{d.dat ? 'Đạt các điểm kiểm' : 'Còn điểm chưa đạt'}</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {d.kiemTra.map((k) => (
              <li key={k.ma} style={{ marginBottom: 6 }}>
                <span className={k.dat ? 'kyc-dat' : 'canh-bao-nhe'}>{k.dat ? 'Đạt' : 'Chưa đạt'}</span> · {k.ten}
                {k.canXacMinh && <span className="phu"> (quy định cần xác minh)</span>}
                {k.chiTiet.map((c) => <div key={c} className="phu">{c}</div>)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bang-cuon">
        <table>
          <thead><tr><th>Thửa / ao</th><th>Hộ</th><th>Vùng</th><th>Mã số vùng / cơ sở nuôi</th><th>Thu hoạch</th><th className="so">Khối lượng trong lô</th>{d.nganh === 'gia_vi' && <th>Nhật ký thuốc</th>}</tr></thead>
          <tbody>
            {d.nguon.length === 0 && <tr><td colSpan={7} className="phu">Chưa có thửa hay ao nào góp hàng qua phiếu thu gom.</td></tr>}
            {d.nguon.map((n) => (
              <tr key={n.ma}>
                <td>{n.ma}<div className="phu">{n.loai === 'ao' ? 'Ao' : 'Thửa'}{n.cayTrong ? ` · ${n.cayTrong}` : ''}</div>{n.luuY.map((x) => <div key={x} className="canh-bao-nhe">{x}</div>)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{n.maHo}</td>
                <td>{n.tenVung}<div className="phu">{n.maVung}</div></td>
                <td>{n.maSoVung ?? <span className="canh-bao-nhe">{n.maSoVungHetHan ? 'Mã đã hết hạn' : 'Chưa có mã đã duyệt'}</span>}</td>
                <td>{ngay(n.thuHoachTu)}{n.thuHoachDen !== n.thuHoachTu && ` – ${ngay(n.thuHoachDen)}`}</td>
                <td className="so">{kg(n.khoiLuongKg)}</td>
                {d.nganh === 'gia_vi' && <td>{n.coNhatKyThuoc ? <span className="kyc-dat">Có</span> : <span className="canh-bao-nhe">Chưa có</span>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="luoi" style={{ marginTop: 12 }}>
        <div className="o">
          <strong>Lô mua góp hàng</strong>
          {d.loMua.length === 0 && <p className="phu">Chưa phân bổ lô mua nào.</p>}
          {d.loMua.map((l) => (
            <div key={l.ma} style={{ marginTop: 6 }}>
              {l.ma} · {kg(l.khoiLuongKg)}
              <div className="phu">{l.nhaCungCap}{l.coSo.length ? ` · qua ${l.coSo.join(', ')}` : ' · chưa ghi kho, xưởng'}{l.maCoSoDongGoi ? ` · mã CSĐG ${l.maCoSoDongGoi}` : ''}</div>
            </div>
          ))}
        </div>
        <div className="o">
          <strong>Kho, xưởng đã xử lý hàng</strong>
          {d.coSo.length === 0 && <p className="phu">Chưa có. Ghi kho, xưởng ở bước sơ chế hoặc nhập kho của lô mua.</p>}
          {d.coSo.map((c) => (
            <div key={c.ten} style={{ marginTop: 6 }}>
              {c.ten}
              <div className="phu">{c.ma.length ? c.ma.map((m) => `${LOAI_MA[m.loai]} ${m.ma}`).join(' · ') : 'Chưa có mã đăng ký. Ghi ở trang Danh mục.'}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
