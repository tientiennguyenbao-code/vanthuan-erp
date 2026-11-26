'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

const NGANH: Record<string, string> = { ca_phe: 'Cà phê', gia_vi: 'Gia vị', thuy_san: 'Thủy sản' };
type Muc = Record<'ca_phe' | 'gia_vi' | 'thuy_san', number | null>;
interface DuLieu { mucChung: Muc; vung: { id: string; code: string; name: string; sector: string; maxYieldKgPerHa: number | null; supplierName: string }[] }

const so = (v: string) => (v.trim() ? Number(v.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) : null);
const hien = (v: number | null) => (v === null ? '' : String(v));

/**
 * Năng suất tối đa (kg/ha/năm): Ban Giám đốc đặt theo ngành, và riêng cho vùng nếu cần.
 * Trần sản lượng của mỗi thửa = diện tích × năng suất; phiếu thu gom làm vượt trần bị từ chối.
 */
export default function NangSuat() {
  const toi = useToi();
  const [d, setD] = useState<DuLieu | null>(null);
  const [muc, setMuc] = useState({ ca_phe: '', gia_vi: '', thuy_san: '' });
  const [rieng, setRieng] = useState<Record<string, string>>({});
  const [loi, setLoi] = useState('');
  const [tb, setTb] = useState('');

  const tai = useCallback(async () => {
    const r = await api<DuLieu>('/nang-suat');
    setD(r);
    setMuc({ ca_phe: hien(r.mucChung.ca_phe), gia_vi: hien(r.mucChung.gia_vi), thuy_san: hien(r.mucChung.thuy_san) });
    setRieng(Object.fromEntries(r.vung.map((v) => [v.id, hien(v.maxYieldKgPerHa)])));
  }, []);
  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  async function lam(fn: () => Promise<unknown>, xong: string) {
    setLoi('');
    setTb('');
    try {
      await fn();
      await tai();
      setTb(xong);
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  if (!toi) return null;
  const duocDat = toi.quyen.includes('NANG_SUAT_DAT');
  function luuChung(e: FormEvent) {
    e.preventDefault();
    lam(() => api('/nang-suat', { method: 'PUT', body: { ca_phe: so(muc.ca_phe), gia_vi: so(muc.gia_vi), thuy_san: so(muc.thuy_san) } }), 'Đã lưu mức chung.');
  }

  return (
    <KhungTrang toi={toi}>
      <p><Link href="/nguon-cung">← Nguồn cung</Link></p>
      <h1>Năng suất tối đa</h1>
      <p className="phu">
        Trần sản lượng của mỗi thửa trong 12 tháng = diện tích × năng suất tối đa. Phiếu thu gom làm vượt trần bị từ chối, vì đó là dấu hiệu hàng nơi khác được ghi vào thửa này.
        Cà phê từ vùng chưa có mức năng suất thì chưa được tính là đủ EUDR.
      </p>
      {tb && <div className="dat" role="status">{tb}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}
      {!duocDat && <p className="phu">Chỉ Giám đốc và Phó Giám đốc đặt được mức năng suất.</p>}
      {d && (
        <>
          <form className="o" onSubmit={luuChung} style={{ maxWidth: 640 }}>
            <strong>Mức chung theo ngành (kg/ha/năm)</strong>
            <div className="luoi">
              {(Object.keys(NGANH) as (keyof typeof muc)[]).map((k) => (
                <div key={k}>
                  <label htmlFor={`ns-${k}`}>{NGANH[k]}</label>
                  <input id={`ns-${k}`} inputMode="decimal" disabled={!duocDat} value={muc[k]} onChange={(e) => setMuc({ ...muc, [k]: e.target.value })} placeholder="Chưa đặt" />
                </div>
              ))}
            </div>
            {duocDat && <button style={{ marginTop: 12 }}>Lưu mức chung</button>}
          </form>

          <h2>Mức riêng theo vùng</h2>
          <p className="phu">Để trống thì vùng dùng mức chung của ngành. Đặt mức riêng khi vùng có năng suất khác hẳn (tưới tốt, giống mới, vùng nuôi thâm canh).</p>
          <div className="bang-cuon">
            <table>
              <thead><tr><th>Vùng</th><th>Nhà cung cấp</th><th>Ngành</th><th>Mức đang dùng</th><th>Mức riêng (kg/ha/năm)</th></tr></thead>
              <tbody>
                {d.vung.length === 0 && <tr><td colSpan={5} className="phu">Chưa có vùng nào.</td></tr>}
                {d.vung.map((v) => {
                  const dung = v.maxYieldKgPerHa ?? d.mucChung[v.sector as keyof Muc];
                  return (
                    <tr key={v.id}>
                      <td>{v.name}<div className="phu">{v.code}</div></td>
                      <td>{v.supplierName}</td>
                      <td>{NGANH[v.sector]}</td>
                      <td className={dung === null ? 'canh-bao-nhe' : ''}>{dung === null ? 'Chưa có' : `${dung.toLocaleString('vi-VN')} kg/ha${v.maxYieldKgPerHa !== null ? ' (riêng)' : ''}`}</td>
                      <td>
                        {duocDat ? (
                          <form style={{ display: 'flex', gap: 6 }} onSubmit={(e) => { e.preventDefault(); lam(() => api(`/nang-suat/vung/${v.id}`, { method: 'PUT', body: { kgMoiHa: so(rieng[v.id] ?? '') } }), `Đã lưu mức riêng cho ${v.name}.`); }}>
                            <input aria-label={`Mức riêng ${v.name}`} inputMode="decimal" style={{ maxWidth: 120 }} value={rieng[v.id] ?? ''} onChange={(e) => setRieng({ ...rieng, [v.id]: e.target.value })} placeholder="Dùng mức chung" />
                            <button className="phu-btn">Lưu</button>
                          </form>
                        ) : (
                          v.maxYieldKgPerHa?.toLocaleString('vi-VN') ?? '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </KhungTrang>
  );
}
