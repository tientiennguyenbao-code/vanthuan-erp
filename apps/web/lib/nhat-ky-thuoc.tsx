'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { ngay } from './nhan';

interface DongNhatKy {
  id: string; thuaId: string; maThua: string; ngayPhun: string; thuoc: string; hoatChat: string | null; cachLyNgay: number;
  lieuLuong: string | null; ghiChu: string | null; nguon: string; nguoiGhi: string; huyLuc: string | null; lyDoHuy: string | null; duocHuy: boolean;
}
interface DuLieu { duocGhi: boolean; thua: { id: string; code: string; crop: string | null; maHo: string }[]; nhatKy: DongNhatKy[] }

const homNay = () => new Date().toISOString().slice(0, 10);
const cong = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/**
 * Nhật ký dùng thuốc BVTV theo thửa gia vị. Phiếu thu gom ghi lưu ý khi thu hoạch trước khi hết thời gian cách ly,
 * và phần truy xuất lô xuất đi EU kiểm thửa có nhật ký. Thửa không dùng thuốc thì ghi một dòng "Không dùng thuốc", cách ly 0 ngày.
 * Dùng chung cho trang nhân viên và cổng nhà cung cấp, chỉ khác đường gọi máy chủ.
 */
export function NhatKyThuoc({ duong, duongGhi, duongHuy }: { duong: string; duongGhi: string; duongHuy: (id: string) => string }) {
  const [d, setD] = useState<DuLieu | null>(null);
  const [loi, setLoi] = useState('');
  const [tb, setTb] = useState('');
  const [f, setF] = useState({ thuaId: '', ngayPhun: homNay(), thuoc: '', hoatChat: '', cachLyNgay: '', lieuLuong: '' });
  const [huy, setHuy] = useState<{ id: string; lyDo: string } | null>(null);

  const tai = useCallback(() => api<DuLieu>(duong).then(setD), [duong]);
  useEffect(() => {
    tai().catch((e: Error) => setLoi(e.message));
  }, [tai]);

  async function lam(fn: () => Promise<string>) {
    setLoi('');
    setTb('');
    try {
      const xong = await fn();
      await tai();
      setTb(xong);
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  function gui(e: FormEvent) {
    e.preventDefault();
    lam(async () => {
      await api(duongGhi, { body: { thuaId: f.thuaId, ngayPhun: f.ngayPhun, thuoc: f.thuoc.trim(), hoatChat: f.hoatChat.trim() || null, cachLyNgay: Number(f.cachLyNgay || 0), lieuLuong: f.lieuLuong.trim() || null } });
      setF({ ...f, thuoc: '', hoatChat: '', cachLyNgay: '', lieuLuong: '' });
      return 'Đã ghi nhật ký.';
    });
  }

  if (!d) return loi ? <div className="loi">{loi}</div> : null;
  if (d.thua.length === 0) return null;
  const today = homNay();

  return (
    <section>
      <h2>Nhật ký dùng thuốc BVTV (gia vị)</h2>
      <p className="phu">
        Mỗi lần phun hoặc bón thuốc trên thửa, ghi tên thuốc, hoạt chất và thời gian cách ly trên nhãn. Hàng thu hoạch khi chưa hết thời gian cách ly có nguy cơ vượt dư lượng tối đa (MRL) ở EU, phiếu thu gom sẽ ghi lưu ý.
        Thửa không dùng thuốc thì ghi một dòng &quot;Không dùng thuốc&quot;, cách ly 0 ngày.
      </p>
      {tb && <div className="dat" role="status">{tb}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}
      {d.duocGhi && (
        <form className="o" onSubmit={gui} style={{ maxWidth: 760, marginBottom: 12 }}>
          <strong>Ghi lần phun</strong>
          <div className="luoi">
            <div><label htmlFor="nk-thua">Thửa</label><select id="nk-thua" required value={f.thuaId} onChange={(e) => setF({ ...f, thuaId: e.target.value })}><option value="">Chọn thửa</option>{d.thua.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.maHo}{t.crop ? ` · ${t.crop}` : ''}</option>)}</select></div>
            <div><label htmlFor="nk-ngay">Ngày phun</label><input id="nk-ngay" type="date" required max={today} value={f.ngayPhun} onChange={(e) => setF({ ...f, ngayPhun: e.target.value })} /></div>
            <div><label htmlFor="nk-thuoc">Tên thuốc</label><input id="nk-thuoc" required minLength={2} value={f.thuoc} onChange={(e) => setF({ ...f, thuoc: e.target.value })} placeholder="Anvil 5SC" /></div>
            <div><label htmlFor="nk-hc">Hoạt chất</label><input id="nk-hc" value={f.hoatChat} onChange={(e) => setF({ ...f, hoatChat: e.target.value })} placeholder="Hexaconazole" /></div>
            <div><label htmlFor="nk-cl">Thời gian cách ly (ngày)</label><input id="nk-cl" inputMode="numeric" required value={f.cachLyNgay} onChange={(e) => setF({ ...f, cachLyNgay: e.target.value.replace(/\D/g, '') })} /></div>
            <div><label htmlFor="nk-ll">Liều lượng</label><input id="nk-ll" value={f.lieuLuong} onChange={(e) => setF({ ...f, lieuLuong: e.target.value })} placeholder="20 ml/bình 16 lít" /></div>
          </div>
          <button style={{ marginTop: 12 }}>Ghi nhật ký</button>
        </form>
      )}
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Thửa</th><th>Ngày phun</th><th>Thuốc</th><th>Cách ly</th><th>Người ghi</th><th></th></tr></thead>
          <tbody>
            {d.nhatKy.length === 0 && <tr><td colSpan={6} className="phu">Chưa có dòng nào.</td></tr>}
            {d.nhatKy.map((x) => {
              const het = cong(x.ngayPhun, x.cachLyNgay);
              return (
                <tr key={x.id} className={x.huyLuc ? 'huy' : ''}>
                  <td>{x.maThua}</td>
                  <td>{ngay(x.ngayPhun)}</td>
                  <td>{x.thuoc}{(x.hoatChat || x.lieuLuong) && <div className="phu">{[x.hoatChat, x.lieuLuong].filter(Boolean).join(' · ')}</div>}</td>
                  <td>{x.cachLyNgay} ngày{x.cachLyNgay > 0 && <div className={!x.huyLuc && het > today ? 'canh-bao-nhe' : 'phu'}>{het > today ? 'chưa được thu hoạch đến' : 'hết cách ly'} {ngay(het)}</div>}</td>
                  <td>{x.nguoiGhi}<div className="phu">{x.nguon === 'cong_ncc' ? 'Nhà cung cấp ghi' : 'Nhân viên ghi'}</div></td>
                  <td>
                    {x.huyLuc ? <span className="phu">Đã huỷ: {x.lyDoHuy}</span> : x.duocHuy && huy?.id !== x.id ? <button type="button" className="phu-btn" onClick={() => setHuy({ id: x.id, lyDo: '' })}>Huỷ</button> : null}
                    {huy?.id === x.id && (
                      <form onSubmit={(e) => { e.preventDefault(); lam(async () => { await api(duongHuy(x.id), { body: { lyDo: huy.lyDo } }); setHuy(null); return 'Đã huỷ dòng nhật ký.'; }); }}>
                        <input aria-label="Lý do huỷ" required minLength={3} placeholder="Lý do huỷ" value={huy.lyDo} onChange={(e) => setHuy({ ...huy, lyDo: e.target.value })} />
                        <button className="phu-btn">Xác nhận</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
