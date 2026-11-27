'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Kho, kg, LOAI_KHU, LOAI_LO_TON, NHAN_EUDR, TRANG_THAI_LO_TON } from '@/lib/kho';
import { HINH_THUC_CO_SO, LOAI_CO_SO, NGANH } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../khung-trang';

interface DongTon {
  facilityId: string;
  facilityName: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  zoneKind: string;
  commodityName: string;
  sector: string;
  kind: string;
  grade: string | null;
  dealType: string;
  eudrClass: string | null;
  status: string;
  kg: number;
  bags: number | null;
  lots: number;
  oldest: string;
}

export default function TongQuanKho() {
  const toi = useToi();
  const [kho, setKho] = useState<Kho[]>([]);
  const [ungVien, setUngVien] = useState<{ id: string; hoTen: string; email: string }[]>([]);
  const [ton, setTon] = useState<{ ton: DongTon[]; tong: { kg: number; lots: number } } | null>(null);
  const [loi, setLoi] = useState('');
  const [chon, setChon] = useState('');
  const [fk, setFk] = useState({ ma: '', ten: '', loai: 'thuong', sucChuaTan: '' });
  const [tk, setTk] = useState('');

  const tai = useCallback(async () => {
    const [a, b] = await Promise.all([api<{ kho: Kho[]; ungVienThuKho: typeof ungVien }>('/kho'), api<{ ton: DongTon[]; tong: { kg: number; lots: number } }>('/kho/ton')]);
    setKho(a.kho);
    setUngVien(a.ungVienThuKho);
    setTon(b);
    setChon((c) => c || a.kho[0]?.id || '');
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
  const k = kho.find((x) => x.id === chon);
  const dong = (ton?.ton ?? []).filter((r) => !chon || r.facilityId === chon);
  const duEudr = (ton?.ton ?? []).filter((r) => r.eudrClass === 'du').reduce((s, r) => s + r.kg, 0);
  const ghiPhieu = kho.some((x) => x.quyen.ghiPhieu);
  return (
    <KhungTrang toi={toi}>
      <h1>Kho và tồn kho</h1>
      <p className="phu">
        Mỗi lô tồn là một khối hàng thật cùng hạng, nằm ở một khu của một kho, và nhớ nó đến từ những lô mua nào. Cà phê đủ EUDR chỉ nằm ở khu đủ EUDR; thủy sản chỉ nằm ở kho lạnh.
      </p>
      <p>
        <Link href="/kho/nhan-hang">{ghiPhieu ? 'Ghi phiếu nhận hàng, xem lô tồn →' : 'Xem lô tồn và phiếu nhận hàng →'}</Link>
        {' · '}
        <Link href="/kho/so-che">{ghiPhieu ? 'Ghi lệnh sơ chế →' : 'Lệnh sơ chế, định mức hao hụt →'}</Link>
        {' · '}
        <Link href="/kho/xuat-kho">{ghiPhieu ? 'Xuất kho cho lô xuất →' : 'Phiếu xuất kho →'}</Link>
        {' · '}
        <Link href="/kho/chuyen-kho">Chuyển kho →</Link>
        {' · '}
        <Link href="/kho/kiem-ke">Kiểm kê tháng →</Link>
      </p>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {ton && (
        <div className="luoi" style={{ marginTop: 12 }}>
          <div className="o"><div className="phu">Tổng tồn mọi kho</div><div className="so-lon">{kg(ton.tong.kg)}</div><div className="phu">{ton.tong.lots} lô tồn</div></div>
          <div className="o"><div className="phu">Cà phê đủ EUDR</div><div className="so-lon">{kg(duEudr)}</div><div className="phu">nằm ở khu đủ EUDR</div></div>
          <div className="o"><div className="phu">Kho, xưởng đang dùng</div><div className="so-lon">{kho.length}</div><div className="phu">{kho.reduce((s, x) => s + x.khu.filter((z) => z.active).length, 0)} khu</div></div>
        </div>
      )}

      <div className="hang" style={{ marginTop: 16 }}>
        <div>
          <label htmlFor="chon-kho">Kho, xưởng</label>
          <select id="chon-kho" value={chon} onChange={(e) => setChon(e.target.value)}>
            {kho.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
      </div>

      {k && (
        <>
          <p className="phu">
            {LOAI_CO_SO[k.kind] ?? k.kind} · {HINH_THUC_CO_SO[k.ownership] ?? k.ownership}
            {k.partnerName ? ` (${k.partnerName})` : ''}
            {k.address ? ` · ${k.address}` : ''} · Thủ kho: {k.thuKho.length ? k.thuKho.map((t) => t.hoTen).join(', ') : 'chưa giao'}
          </p>
          <div className="luoi">
            {k.khu.map((z) => (
              <div key={z.id} className={`o ${z.active ? '' : 'huy'}`}>
                <div><strong>{z.code}</strong> · {z.name}</div>
                <div><span className={`nhan ${z.kind === 'du_eudr' ? 'nhan-eudr' : ''}`}>{LOAI_KHU[z.kind] ?? z.kind}</span></div>
                <div className="so-lon">{kg(z.tonKg)}</div>
                <div className="phu">
                  {z.soLoTon} lô tồn{z.capacityKg ? ` · sức chứa ${kg(z.capacityKg)}, đã dùng ${Math.round((z.tonKg / z.capacityKg) * 100)}%` : ''}
                </div>
                {k.quyen.cauHinh && z.active && z.tonKg === 0 && (
                  <button className="phu-btn nho" style={{ marginTop: 8 }} onClick={() => lam(() => api(`/kho/khu/${z.id}/ngung`, { method: 'POST' }))}>Ngừng dùng khu</button>
                )}
              </div>
            ))}
            {k.khu.length === 0 && <div className="o phu">Kho này chưa khai khu nào.</div>}
          </div>

          <h2>Tồn theo khu và hạng</h2>
          <div className="bang-cuon">
            <table>
              <thead><tr><th>Khu</th><th>Mặt hàng</th><th>Loại</th><th>Hạng</th><th>EUDR</th><th className="so">Tồn</th><th className="so">Bao</th><th className="so">Số lô</th><th>Nhận sớm nhất</th></tr></thead>
              <tbody>
                {dong.length === 0 && <tr><td colSpan={9} className="phu">Kho này chưa có hàng.</td></tr>}
                {dong.map((r) => (
                  <tr key={`${r.zoneId}-${r.commodityName}-${r.kind}-${r.grade}-${r.dealType}-${r.eudrClass}-${r.status}`}>
                    <td><strong>{r.zoneCode}</strong> <span className="phu">{LOAI_KHU[r.zoneKind]}</span></td>
                    <td>{r.commodityName} <span className="phu">{NGANH[r.sector]}</span></td>
                    <td>{LOAI_LO_TON[r.kind] ?? r.kind}{r.status !== 'san_sang' && <div className="canh-bao-nhe">{TRANG_THAI_LO_TON[r.status]}</div>}</td>
                    <td>{r.grade ?? '—'}</td>
                    <td>{r.eudrClass ? <span className={`nhan ${r.eudrClass === 'du' ? 'nhan-eudr' : 'nhan-khong-eudr'}`}>{NHAN_EUDR[r.eudrClass]}</span> : '—'}</td>
                    <td className="so">{kg(r.kg)}</td>
                    <td className="so">{r.bags ?? '—'}</td>
                    <td className="so">{r.lots}</td>
                    <td>{new Date(r.oldest).toLocaleDateString('vi-VN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {k.quyen.cauHinh && (
            <>
              <h2>Khai khu và giao thủ kho</h2>
              <form className="o" onSubmit={(e: FormEvent) => { e.preventDefault(); lam(() => api(`/kho/${k.id}/khu`, { body: { ma: fk.ma, ten: fk.ten, loai: fk.loai, sucChuaKg: fk.sucChuaTan ? Number(fk.sucChuaTan) * 1000 : null } }).then(() => setFk({ ma: '', ten: '', loai: fk.loai, sucChuaTan: '' }))); }}>
                <div className="hang">
                  <div><label htmlFor="km">Mã khu</label><input id="km" required value={fk.ma} onChange={(e) => setFk({ ...fk, ma: e.target.value })} placeholder="VD: A" /></div>
                  <div style={{ flexBasis: 260 }}><label htmlFor="kt">Tên khu</label><input id="kt" required value={fk.ten} onChange={(e) => setFk({ ...fk, ten: e.target.value })} /></div>
                  <div>
                    <label htmlFor="kl">Loại khu</label>
                    <select id="kl" value={fk.loai} onChange={(e) => setFk({ ...fk, loai: e.target.value })}>
                      {Object.entries(LOAI_KHU).map(([a, b]) => <option key={a} value={a}>{b}</option>)}
                    </select>
                  </div>
                  <div><label htmlFor="ks">Sức chứa (tấn)</label><input id="ks" type="number" min="0" step="any" value={fk.sucChuaTan} onChange={(e) => setFk({ ...fk, sucChuaTan: e.target.value })} /></div>
                  <button type="submit">Thêm khu</button>
                </div>
              </form>
              <div className="o" style={{ marginTop: 12 }}>
                <div className="hang">
                  <div>
                    <label htmlFor="tk">Giao thủ kho</label>
                    <select id="tk" value={tk} onChange={(e) => setTk(e.target.value)}>
                      <option value="">Chọn tài khoản thủ kho</option>
                      {ungVien.filter((u) => !k.thuKho.some((t) => t.id === u.id)).map((u) => <option key={u.id} value={u.id}>{u.hoTen} ({u.email})</option>)}
                    </select>
                  </div>
                  <button disabled={!tk} onClick={() => lam(() => api(`/kho/${k.id}/thu-kho`, { body: { nguoiDungId: tk } }).then(() => setTk('')))}>Giao kho</button>
                </div>
                {k.thuKho.map((t) => (
                  <div key={t.id} style={{ marginTop: 8 }}>
                    {t.hoTen} <button className="phu-btn nho" onClick={() => lam(() => api(`/kho/${k.id}/thu-kho/${t.id}/bo`, { method: 'POST' }))}>Bỏ giao</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {kho.length === 0 && <p className="phu">Chưa có kho, xưởng nào. Thêm kho, xưởng ở trang Danh mục.</p>}
    </KhungTrang>
  );
}
