'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { kg } from './lo-hang';
import { NGANH } from './nhan';
import { ha } from './nguon-cung';

export interface ThuaUocTinh {
  id: string; code: string; maHo: string; tenHo: string | null; maVung: string; nganh: string; dienTichHa: number;
  tranKg: number | null; apDungEudr: boolean; lyDoChuaDuEudr: string[]; uocTinh: Record<string, number>; tongKg: number;
}
interface DuLieu { thang: string[]; duocSua: boolean; thua: ThuaUocTinh[] }

/** "2026-11" → "11/2026" */
export const thangVn = (m: string) => `${Number(m.slice(5, 7))}/${m.slice(0, 4)}`;
const so = (v: string) => Number(v.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));

/**
 * Sản lượng ước tính theo thửa và tháng thu hoạch, 12 tháng tới. Dùng chung cho trang nhân viên và cổng nhà cung
 * cấp, chỉ khác đường gọi máy chủ. Tổng ước tính trong 12 tháng liên tiếp không được vượt trần của thửa.
 */
export function UocTinhThua({ duongDoc, duongGhi }: { duongDoc: string; duongGhi: string }) {
  const [d, setD] = useState<DuLieu | null>(null);
  const [loi, setLoi] = useState('');
  const [tb, setTb] = useState('');
  const [f, setF] = useState({ thuaId: '', thang: '', khoiLuongKg: '' });

  const tai = useCallback(() => api<DuLieu>(duongDoc).then((r) => {
    setD(r);
    setF((x) => ({ ...x, thang: x.thang || r.thang[1] || r.thang[0] }));
  }), [duongDoc]);
  useEffect(() => {
    tai().catch((e: Error) => setLoi(e.message));
  }, [tai]);

  async function gui(e: FormEvent) {
    e.preventDefault();
    setLoi('');
    setTb('');
    try {
      const kgMoi = so(f.khoiLuongKg || '0');
      await api(duongGhi, { method: 'PUT', body: { thuaId: f.thuaId, thang: f.thang, khoiLuongKg: kgMoi } });
      await tai();
      const t = d?.thua.find((x) => x.id === f.thuaId);
      setTb(kgMoi > 0 ? `Đã ghi ước tính ${kg(kgMoi)} cho thửa ${t?.code} tháng ${thangVn(f.thang)}.` : `Đã xoá ước tính của thửa ${t?.code} tháng ${thangVn(f.thang)}.`);
      setF({ ...f, khoiLuongKg: '' });
    } catch (err) {
      setLoi((err as Error).message);
    }
  }

  if (!d) return loi ? <div className="loi">{loi}</div> : <p className="phu">Đang tải sản lượng ước tính…</p>;
  const chon = d.thua.find((t) => t.id === f.thuaId);
  const tongThang = d.thang.map((m) => d.thua.reduce((s, t) => s + (t.uocTinh[m] ?? 0), 0));

  return (
    <section>
      <h2>Sản lượng ước tính 12 tháng tới</h2>
      <p className="phu">
        Số kg dự kiến thu hoạch theo thửa và tháng. Phần mềm cộng các ước tính này thành nguồn cung của kế hoạch thu mua, để kinh doanh chỉ chào bán hàng thật sự có.
        Ước tính trong 12 tháng liên tiếp không được vượt trần sản lượng của thửa.
      </p>
      {tb && <div className="dat" role="status">{tb}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}

      {d.duocSua && d.thua.length > 0 && (
        <form className="o" onSubmit={gui} style={{ maxWidth: 640, marginBottom: 12 }}>
          <strong>Ghi hoặc sửa ước tính</strong>
          <div className="luoi">
            <div>
              <label htmlFor="ut-thua">Thửa</label>
              <select id="ut-thua" required value={f.thuaId} onChange={(e) => setF({ ...f, thuaId: e.target.value })}>
                <option value="">Chọn thửa</option>
                {d.thua.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.maHo} · {ha(t.dienTichHa)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ut-thang">Tháng thu hoạch</label>
              <select id="ut-thang" required value={f.thang} onChange={(e) => setF({ ...f, thang: e.target.value })}>
                {d.thang.map((m) => <option key={m} value={m}>{thangVn(m)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ut-kg">Khối lượng dự kiến (kg)</label>
              <input id="ut-kg" inputMode="decimal" value={f.khoiLuongKg} onChange={(e) => setF({ ...f, khoiLuongKg: e.target.value })} placeholder="0 để xoá" />
            </div>
          </div>
          {chon && (
            <p className={chon.lyDoChuaDuEudr.length ? 'canh-bao-nhe' : 'phu'} style={{ marginTop: 8 }}>
              {chon.tranKg === null ? 'Thửa chưa có trần sản lượng (vùng chưa có mức năng suất tối đa).' : `Trần 12 tháng: ${kg(chon.tranKg)}. Đã ước tính: ${kg(chon.tongKg)}.`}
              {chon.uocTinh[f.thang] !== undefined && ` Tháng này đang ghi ${kg(chon.uocTinh[f.thang])}.`}
              {chon.lyDoChuaDuEudr.length > 0 && ` Hàng của thửa chưa tính là đủ EUDR: ${chon.lyDoChuaDuEudr.join('; ')}.`}
            </p>
          )}
          <button style={{ marginTop: 12 }}>Lưu ước tính</button>
        </form>
      )}

      <div className="bang-cuon">
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 220 }}>Thửa</th><th className="so">Trần 12 tháng</th>
              {d.thang.map((m) => <th key={m} className="so">{thangVn(m)}</th>)}
              <th className="so">Cộng</th>
            </tr>
          </thead>
          <tbody>
            {d.thua.length === 0 && <tr><td colSpan={d.thang.length + 3} className="phu">Chưa có thửa nào.</td></tr>}
            {d.thua.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.code}
                  <div className="phu">{t.maHo}{t.tenHo ? ` · ${t.tenHo}` : ''} · {NGANH[t.nganh]}</div>
                  {t.apDungEudr && (t.lyDoChuaDuEudr.length ? <div className="canh-bao-nhe" title={t.lyDoChuaDuEudr.join('; ')}>Chưa đủ EUDR</div> : <div className="kyc-dat">Đủ EUDR</div>)}
                </td>
                <td className="so">{t.tranKg === null ? <span className="canh-bao-nhe">Chưa có</span> : kg(t.tranKg)}</td>
                {d.thang.map((m) => <td key={m} className="so">{t.uocTinh[m] ? t.uocTinh[m].toLocaleString('vi-VN') : ''}</td>)}
                <td className="so"><strong>{t.tongKg.toLocaleString('vi-VN')}</strong></td>
              </tr>
            ))}
          </tbody>
          {d.thua.length > 0 && (
            <tfoot>
              <tr>
                <th colSpan={2}>Cộng (kg)</th>
                {tongThang.map((v, i) => <th key={d.thang[i]} className="so">{v ? v.toLocaleString('vi-VN') : ''}</th>)}
                <th className="so">{tongThang.reduce((a, b) => a + b, 0).toLocaleString('vi-VN')}</th>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
