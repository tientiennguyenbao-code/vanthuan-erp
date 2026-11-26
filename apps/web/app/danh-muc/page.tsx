'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { HINH_THUC_CO_SO, LOAI_CO_SO, NGANH } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../khung-trang';

interface MatHang { id: string; code: string; name: string; sector: string; hsCode: string | null; specFields: string[]; active: boolean }
interface MaCoSo { id: string; loai: string; ma: string; hieuLucDen: string | null; ghiChu: string | null }
interface CoSo { id: string; name: string; kind: string; ownership: string; partnerName: string | null; address: string | null; capacityKg: number | null; ma: MaCoSo[] }
const LOAI_MA: Record<string, string> = { fda: 'FDA (Mỹ)', gacc: 'GACC (Trung Quốc)', eu_list: 'Danh sách EU' };
interface DoiTacNgan { id: string; code: string; name: string }

export default function DanhMuc() {
  const toi = useToi();
  const [mh, setMh] = useState<MatHang[]>([]);
  const [cs, setCs] = useState<CoSo[]>([]);
  const [dt, setDt] = useState<DoiTacNgan[]>([]);
  const [loi, setLoi] = useState('');
  const [fm, setFm] = useState({ code: '', name: '', sector: 'ca_phe', hsCode: '', specFields: '' });
  const [fc, setFc] = useState({ name: '', kind: 'kho', ownership: 'thue', partnerId: '', address: '', capacityTan: '' });
  const [fma, setFma] = useState({ coSoId: '', loai: 'fda', ma: '', hieuLucDen: '' });
  const [huyMa, setHuyMa] = useState<{ id: string; lyDo: string } | null>(null);

  const tai = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      api<{ matHang: MatHang[] }>('/danh-muc/mat-hang'),
      api<{ coSo: CoSo[] }>('/danh-muc/co-so'),
      api<{ doiTac: DoiTacNgan[] }>('/doi-tac'),
    ]);
    setMh(a.matHang);
    setCs(b.coSo);
    setDt(c.doiTac);
  }, []);
  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  async function lam(viec: () => Promise<unknown>) {
    setLoi('');
    try {
      await viec();
      await tai();
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  if (!toi) return null;
  const quanLy = toi.quyen.includes('DANH_MUC_QUAN_LY');
  return (
    <KhungTrang toi={toi}>
      <h1>Danh mục</h1>
      {loi && <div className="loi" role="alert">{loi}</div>}

      <h2>Mặt hàng</h2>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Mã</th><th>Tên</th><th>Ngành</th><th>Mã HS</th><th>Chỉ tiêu quy cách</th></tr></thead>
          <tbody>
            {mh.map((m) => (
              <tr key={m.id} className={m.active ? '' : 'huy'}>
                <td>{m.code}</td><td>{m.name}</td><td>{NGANH[m.sector] ?? m.sector}</td><td>{m.hsCode ?? '—'}</td>
                <td>{m.specFields.map((s) => <span className="nhan" key={s}>{s}</span>)}</td>
              </tr>
            ))}
            {mh.length === 0 && <tr><td colSpan={5} className="phu">Chưa có mặt hàng.</td></tr>}
          </tbody>
        </table>
      </div>
      {quanLy && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={(e: FormEvent) => { e.preventDefault(); lam(() => api('/danh-muc/mat-hang', { body: { code: fm.code, name: fm.name, sector: fm.sector, hsCode: fm.hsCode || null, specFields: fm.specFields.split(',').map((s) => s.trim()).filter(Boolean) } }).then(() => setFm({ code: '', name: '', sector: fm.sector, hsCode: '', specFields: '' }))); }}>
          <div className="hang">
            <div><label htmlFor="mhm">Mã</label><input id="mhm" required value={fm.code} onChange={(e) => setFm({ ...fm, code: e.target.value })} placeholder="VD: ROB-G2" /></div>
            <div style={{ flexBasis: 280 }}><label htmlFor="mht">Tên</label><input id="mht" required value={fm.name} onChange={(e) => setFm({ ...fm, name: e.target.value })} /></div>
            <div>
              <label htmlFor="mhn">Ngành</label>
              <select id="mhn" value={fm.sector} onChange={(e) => setFm({ ...fm, sector: e.target.value })}>
                {Object.entries(NGANH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label htmlFor="mhhs">Mã HS</label><input id="mhhs" value={fm.hsCode} onChange={(e) => setFm({ ...fm, hsCode: e.target.value })} placeholder="0901.11" /></div>
          </div>
          <label htmlFor="mhq">Chỉ tiêu quy cách (cách nhau bằng dấu phẩy)</label>
          <input id="mhq" value={fm.specFields} onChange={(e) => setFm({ ...fm, specFields: e.target.value })} placeholder="Độ ẩm %, Tạp chất %, Sàng 13" />
          <button style={{ marginTop: 12 }}>Thêm mặt hàng</button>
        </form>
      )}

      <h2>Kho và xưởng sơ chế</h2>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Tên</th><th>Loại</th><th>Hình thức</th><th>Đối tác sở hữu</th><th>Công suất</th><th>Mã đăng ký với nước nhập</th></tr></thead>
          <tbody>
            {cs.map((c) => (
              <tr key={c.id}>
                <td>{c.name}<div className="phu">{c.address}</div></td><td>{LOAI_CO_SO[c.kind]}</td><td>{HINH_THUC_CO_SO[c.ownership]}</td>
                <td>{c.partnerName ?? '—'}</td><td>{c.capacityKg ? `${(c.capacityKg / 1000).toLocaleString('vi-VN')} tấn` : '—'}</td>
                <td>
                  {c.ma.length === 0 && <span className="phu">Chưa có</span>}
                  {c.ma.map((m) => {
                    const het = !!m.hieuLucDen && m.hieuLucDen < new Date().toISOString().slice(0, 10);
                    return (
                      <div key={m.id}>
                        {LOAI_MA[m.loai]}: <strong>{m.ma}</strong>
                        {m.hieuLucDen && <span className={het ? 'canh-bao-nhe' : 'phu'}> · {het ? 'hết hạn' : 'đến'} {new Date(m.hieuLucDen).toLocaleDateString('vi-VN')}</span>}
                        {quanLy && huyMa?.id !== m.id && <button type="button" className="phu-btn nho" style={{ marginLeft: 6 }} onClick={() => setHuyMa({ id: m.id, lyDo: '' })}>Huỷ</button>}
                        {huyMa?.id === m.id && (
                          <form style={{ display: 'flex', gap: 6, marginTop: 4 }} onSubmit={(e) => { e.preventDefault(); lam(() => api(`/danh-muc/ma-co-so/${m.id}/huy`, { body: { lyDo: huyMa.lyDo } }).then(() => setHuyMa(null))); }}>
                            <input aria-label="Lý do huỷ mã" required minLength={3} placeholder="Lý do huỷ" value={huyMa.lyDo} onChange={(e) => setHuyMa({ ...huyMa, lyDo: e.target.value })} />
                            <button className="phu-btn">Xác nhận</button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </td>
              </tr>
            ))}
            {cs.length === 0 && <tr><td colSpan={6} className="phu">Chưa có kho, xưởng.</td></tr>}
          </tbody>
        </table>
      </div>
      {quanLy && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={(e: FormEvent) => { e.preventDefault(); lam(() => api('/danh-muc/co-so', { body: { name: fc.name, kind: fc.kind, ownership: fc.ownership, partnerId: fc.partnerId || null, address: fc.address || null, capacityKg: fc.capacityTan ? Math.round(Number(fc.capacityTan) * 1000) : null } }).then(() => setFc({ ...fc, name: '', address: '', capacityTan: '' }))); }}>
          <div className="hang">
            <div style={{ flexBasis: 260 }}><label htmlFor="csn">Tên</label><input id="csn" required value={fc.name} onChange={(e) => setFc({ ...fc, name: e.target.value })} /></div>
            <div><label htmlFor="csl">Loại</label><select id="csl" value={fc.kind} onChange={(e) => setFc({ ...fc, kind: e.target.value })}>{Object.entries(LOAI_CO_SO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label htmlFor="csh">Hình thức</label><select id="csh" value={fc.ownership} onChange={(e) => setFc({ ...fc, ownership: e.target.value })}>{Object.entries(HINH_THUC_CO_SO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            {fc.ownership !== 'tu_van_hanh' && (
              <div><label htmlFor="csd">Đối tác sở hữu</label><select id="csd" required value={fc.partnerId} onChange={(e) => setFc({ ...fc, partnerId: e.target.value })}><option value="">Chọn…</option>{dt.map((d) => <option key={d.id} value={d.id}>{d.code} – {d.name}</option>)}</select></div>
            )}
          </div>
          <div className="hang">
            <div style={{ flexBasis: 320 }}><label htmlFor="csa">Địa chỉ</label><input id="csa" value={fc.address} onChange={(e) => setFc({ ...fc, address: e.target.value })} /></div>
            <div><label htmlFor="csc">Công suất (tấn)</label><input id="csc" inputMode="decimal" value={fc.capacityTan} onChange={(e) => setFc({ ...fc, capacityTan: e.target.value })} /></div>
            <button>Thêm</button>
          </div>
        </form>
      )}
      {quanLy && cs.length > 0 && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={(e: FormEvent) => { e.preventDefault(); lam(() => api(`/danh-muc/co-so/${fma.coSoId}/ma`, { body: { loai: fma.loai, ma: fma.ma, hieuLucDen: fma.hieuLucDen || null } }).then(() => setFma({ ...fma, ma: '', hieuLucDen: '' }))); }}>
          <strong>Ghi mã đăng ký của cơ sở</strong>
          <p className="phu">Phần truy xuất lô xuất kiểm mã này theo thị trường: Mỹ cần mã FDA, Trung Quốc cần mã GACC, thủy sản sang EU cần cơ sở có trong danh sách được xuất vào EU. Mỗi cơ sở một mã còn dùng cho mỗi loại; đổi mã thì huỷ mã cũ trước.</p>
          <div className="hang">
            <div style={{ flexBasis: 260 }}><label htmlFor="mcs">Cơ sở</label><select id="mcs" required value={fma.coSoId} onChange={(e) => setFma({ ...fma, coSoId: e.target.value })}><option value="">Chọn…</option>{cs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label htmlFor="mcl">Loại mã</label><select id="mcl" value={fma.loai} onChange={(e) => setFma({ ...fma, loai: e.target.value })}>{Object.entries(LOAI_MA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label htmlFor="mcm">Mã</label><input id="mcm" required minLength={3} value={fma.ma} onChange={(e) => setFma({ ...fma, ma: e.target.value })} /></div>
            <div><label htmlFor="mch">Hiệu lực đến</label><input id="mch" type="date" value={fma.hieuLucDen} onChange={(e) => setFma({ ...fma, hieuLucDen: e.target.value })} /></div>
            <button>Ghi mã</button>
          </div>
        </form>
      )}
    </KhungTrang>
  );
}
