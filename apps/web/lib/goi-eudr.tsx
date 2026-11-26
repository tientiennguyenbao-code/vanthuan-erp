'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { kg } from './lo-hang';
import { ngay, ngayGio } from './nhan';
import { CACH_KIEM_RUNG, ha, taiGeojson } from './nguon-cung';

interface GoiEudr {
  xemTruoc: {
    loXuat: { ma: string; tongKg: number; maHs: string | null };
    loMua: { ma: string; nhaCungCap: string; khoiLuongKg: number; nhanEudr: string | null }[];
    thua: { ma: string; maHo: string; maVung: string; maSoVung: string | null; dienTichHa: number; khoiLuongKg: number; thuHoachTu: string; thuHoachDen: string; loai: string; kiemTraRung: { trangThai: string; cach: string | null; duyetNgay: string | null } }[];
    tongHop: { soThua: number; soHo: number; dienTichHa: number };
  };
  vanDe: string[];
  maBamHienTai: string;
  daChot: { version: number; contentHash: string; createdAt: string; createdByName: string }[];
  khopBanChotGanNhat: boolean;
  duocChot: boolean;
}

/**
 * Gói dữ liệu EUDR của lô xuất đi EU: thửa, hộ, khối lượng, kết quả kiểm tra rừng.
 * Người nhập khẩu ở EU dùng tệp GeoJSON này để nộp tờ khai thẩm định (DDS).
 */
export function GoiEudrLo({ loId }: { loId: string }) {
  const [d, setD] = useState<GoiEudr | null>(null);
  const [loi, setLoi] = useState('');
  const [tb, setTb] = useState('');
  const tai = useCallback(() => api<GoiEudr>(`/lo-xuat/${loId}/goi-eudr`).then(setD), [loId]);
  useEffect(() => {
    tai().catch((e: Error) => setLoi(e.message));
  }, [tai]);

  async function chot() {
    setLoi('');
    setTb('');
    try {
      const r = await api<{ version: number; contentHash: string }>(`/lo-xuat/${loId}/goi-eudr`, { method: 'POST', body: {} });
      setTb(`Đã chốt gói bản ${r.version}. Mã băm đã ghi vào sổ cái hợp đồng.`);
      await tai();
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  if (!d) return loi ? <div className="loi">{loi}</div> : <p className="phu">Đang tải gói EUDR…</p>;
  const g = d.xemTruoc;
  return (
    <section>
      <p className="phu">
        Gói gồm tọa độ từng thửa, khối lượng và kết quả kiểm tra rừng, để người nhập khẩu ở EU nộp tờ khai thẩm định (DDS). Không có tên hay số CCCD của hộ.
        Mỗi lần chốt là một bản; mã băm được ghi vào sổ cái của hợp đồng nên không sửa lén được.
      </p>
      {tb && <div className="dat" role="status">{tb}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}
      <div className="luoi" style={{ margin: '12px 0' }}>
        <div className="o"><div className="phu">Thửa</div><div className="so-lon">{g.tongHop.soThua}</div></div>
        <div className="o"><div className="phu">Hộ</div><div className="so-lon">{g.tongHop.soHo}</div></div>
        <div className="o"><div className="phu">Diện tích</div><div className="so-lon">{ha(g.tongHop.dienTichHa)}</div></div>
        <div className="o"><div className="phu">Khối lượng lô xuất</div><div className="so-lon">{kg(g.loXuat.tongKg)}</div></div>
      </div>
      {d.vanDe.length > 0 ? (
        <div className="o" style={{ borderColor: 'var(--loi)' }}>
          <strong className="kyc-canh-bao">Chưa chốt được gói</strong>
          <ul>{d.vanDe.map((v) => <li key={v}>{v}</li>)}</ul>
        </div>
      ) : d.khopBanChotGanNhat ? (
        <p className="kyc-dat">Dữ liệu khớp bản đã chốt gần nhất.</p>
      ) : d.daChot.length > 0 ? (
        <p className="canh-bao-nhe">Dữ liệu đã đổi so với bản chốt gần nhất. Chốt bản mới trước khi gửi cho người nhập khẩu.</p>
      ) : null}
      {d.duocChot && <button onClick={chot} style={{ marginBottom: 12 }}>Chốt gói EUDR{d.daChot.length ? ` bản ${d.daChot[0].version + 1}` : ''}</button>}

      {g.thua.length > 0 && (
        <div className="bang-cuon">
          <table>
            <thead><tr><th>Thửa</th><th>Hộ</th><th>Vùng</th><th>Diện tích</th><th>Khối lượng thu gom</th><th>Thu hoạch</th><th>Kiểm tra rừng</th></tr></thead>
            <tbody>
              {g.thua.map((t) => (
                <tr key={t.ma}>
                  <td>{t.ma}<div className="phu">{t.loai === 'diem' ? 'một điểm' : 'ranh giới'}</div></td>
                  <td>{t.maHo}</td>
                  <td>{t.maVung}{t.maSoVung && <div className="phu">{t.maSoVung}</div>}</td>
                  <td>{ha(t.dienTichHa)}</td>
                  <td>{kg(t.khoiLuongKg)}</td>
                  <td>{ngay(t.thuHoachTu)}{t.thuHoachDen !== t.thuHoachTu && ` – ${ngay(t.thuHoachDen)}`}</td>
                  <td className={t.kiemTraRung.trangThai === 'khong_rung' ? 'kyc-dat' : 'kyc-canh-bao'}>
                    {t.kiemTraRung.trangThai === 'khong_rung' ? 'Không rừng' : 'Chưa đạt'}
                    {t.kiemTraRung.cach && <div className="phu">{CACH_KIEM_RUNG[t.kiemTraRung.cach]}{t.kiemTraRung.duyetNgay && `, duyệt ${ngay(t.kiemTraRung.duyetNgay)}`}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {d.daChot.length > 0 && (
        <>
          <h3>Các bản đã chốt</h3>
          <div className="bang-cuon">
            <table>
              <thead><tr><th>Bản</th><th>Chốt lúc</th><th>Người chốt</th><th>Mã băm</th><th></th></tr></thead>
              <tbody>
                {d.daChot.map((p) => (
                  <tr key={p.version}>
                    <td>{p.version}</td>
                    <td>{ngayGio(p.createdAt)}</td>
                    <td>{p.createdByName}</td>
                    <td><code>{p.contentHash.slice(0, 16)}…</code></td>
                    <td><button className="phu-btn nho" onClick={() => taiGeojson(`/lo-xuat/${loId}/goi-eudr/${p.version}/geojson`, `${g.loXuat.ma}-EUDR-v${p.version}`).catch((e: Error) => setLoi(e.message))}>Tải GeoJSON</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
