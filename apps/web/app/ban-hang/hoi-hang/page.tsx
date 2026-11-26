'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { HoiHang, LY_DO_THUA, NGUON_HOI_HANG, NhanHoiHang, TongHop, TRANG_THAI_HOI_HANG } from '@/lib/ban-hang';
import { DoiTac } from '@/lib/doi-tac';
import { ngay, tien } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

const homNay = () => new Date().toISOString().slice(0, 10);
const so = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));
const trong = () => ({
  doiTacId: '',
  matHangId: '',
  nguon: 'email',
  ngayNhan: homNay(),
  soLuong: 0,
  donVi: 'tan',
  quyCach: '',
  chungNhan: '',
  thangGiao: '',
  incoterms: 'FOB',
  cangDen: '',
  giaMucTieu: '',
  tienTe: 'USD',
  ghiChu: '',
});

export default function DanhSachHoiHang() {
  const toi = useToi();
  const [ds, setDs] = useState<HoiHang[]>([]);
  const [th, setTh] = useState<TongHop | null>(null);
  const [trangThai, setTrangThai] = useState('');
  const [loi, setLoi] = useState('');
  const [mo, setMo] = useState(false);
  const [v, setV] = useState(trong());
  const [chon, setChon] = useState<{ mua: DoiTac[]; matHang: { id: string; name: string }[] }>({ mua: [], matHang: [] });

  const tai = useCallback(async (tt = trangThai) => {
    const r = await api<{ hoiHang: HoiHang[]; tongHop: TongHop }>(`/hoi-hang${tt ? `?trangThai=${tt}` : ''}`);
    setDs(r.hoiHang);
    setTh(r.tongHop);
  }, [trangThai]);

  useEffect(() => {
    if (!toi) return;
    tai().catch((e: Error) => setLoi(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toi]);

  async function moForm() {
    setMo(!mo);
    if (chon.matHang.length) return;
    try {
      const [a, b] = await Promise.all([
        api<{ doiTac: DoiTac[] }>('/doi-tac?vai=nguoi_mua'),
        api<{ matHang: { id: string; name: string; active: boolean }[] }>('/danh-muc/mat-hang'),
      ]);
      setChon({ mua: a.doiTac, matHang: b.matHang.filter((m) => m.active) });
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  async function tao(e: FormEvent) {
    e.preventDefault();
    setLoi('');
    try {
      const r = await api<{ id: string }>('/hoi-hang', {
        body: {
          ...v,
          quyCach: v.quyCach || null,
          chungNhan: v.chungNhan || null,
          thangGiao: v.thangGiao || null,
          cangDen: v.cangDen || null,
          giaMucTieu: v.giaMucTieu ? so(v.giaMucTieu) : null,
          ghiChu: v.ghiChu || null,
        },
      });
      window.location.href = `/ban-hang/hoi-hang/${r.id}`;
    } catch (err) {
      setLoi((err as Error).message);
    }
  }

  if (!toi) return null;
  const set = (k: keyof ReturnType<typeof trong>, val: string | number) => setV({ ...v, [k]: val });
  const coTheLap = toi.quyen.includes('HOP_DONG_SOAN_TAT_CA') || toi.quyen.includes('HOP_DONG_SOAN_CUA_MINH');
  const loc = (tt: string) => {
    setTrangThai(tt);
    tai(tt).catch((er: Error) => setLoi(er.message));
  };
  return (
    <KhungTrang toi={toi}>
      <h1>Hỏi hàng</h1>
      <p className="phu">
        Mỗi yêu cầu của người mua là một phiếu. Phiếu mới cần có báo giá trong 2 ngày làm việc. · <Link href="/ban-hang/mau">Mẫu hàng</Link>
      </p>

      {th && (
        <div className="luoi" style={{ marginTop: 12 }}>
          <div className="o"><div className="phu">Đang mở</div><div className="so-lon">{th.theoTrangThai.moi + th.theoTrangThai.dang_bao_gia}</div><div className="phu">{th.theoTrangThai.moi} mới · {th.theoTrangThai.dang_bao_gia} đang báo giá</div></div>
          <div className="o"><div className="phu">Quá hạn báo giá</div><div className={`so-lon ${th.quaHan ? 'kyc-canh-bao' : ''}`}>{th.quaHan}</div><div className="phu">quá 2 ngày làm việc chưa có báo giá</div></div>
          <div className="o"><div className="phu">Tỷ lệ thắng</div><div className="so-lon">{th.tyLeThang == null ? '—' : `${th.tyLeThang.toLocaleString('vi-VN')}%`}</div><div className="phu">{th.theoTrangThai.thang} thắng · {th.theoTrangThai.thua} thua</div></div>
          <div className="o">
            <div className="phu">Lý do thua</div>
            {Object.keys(th.lyDoThua).length === 0 ? <div className="phu" style={{ marginTop: 8 }}>Chưa có</div> : Object.entries(th.lyDoThua).sort((a, b) => b[1] - a[1]).map(([k, c]) => <div key={k}>{LY_DO_THUA[k] ?? k}: <strong>{c}</strong></div>)}
          </div>
        </div>
      )}

      <div className="hang" style={{ marginTop: 16 }}>
        <div>
          <label htmlFor="tthai">Trạng thái</label>
          <select id="tthai" value={trangThai} onChange={(e) => loc(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="qua_han">Quá hạn báo giá</option>
            {Object.entries(TRANG_THAI_HOI_HANG).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        {coTheLap && <button type="button" className="phu-btn" onClick={moForm}>Phiếu hỏi hàng mới</button>}
      </div>
      {loi && <div className="loi" role="alert">{loi}</div>}

      {mo && (
        <form className="o" style={{ marginTop: 16 }} onSubmit={tao}>
          <strong>Phiếu hỏi hàng mới</strong>
          <div className="hang">
            <div style={{ flexBasis: 300 }}>
              <label htmlFor="dt">Người mua</label>
              <select id="dt" required value={v.doiTacId} onChange={(e) => set('doiTacId', e.target.value)}>
                <option value="">Chọn…</option>
                {chon.mua.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.country})</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="mh">Mặt hàng</label>
              <select id="mh" required value={v.matHangId} onChange={(e) => set('matHangId', e.target.value)}>
                <option value="">Chọn…</option>
                {chon.matHang.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ng">Nguồn</label>
              <select id="ng" value={v.nguon} onChange={(e) => set('nguon', e.target.value)}>{Object.entries(NGUON_HOI_HANG).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
            </div>
            <div><label htmlFor="nn">Ngày nhận</label><input id="nn" type="date" required max={homNay()} value={v.ngayNhan} onChange={(e) => set('ngayNhan', e.target.value)} /></div>
          </div>
          <div className="hang">
            <div><label htmlFor="sl">Số lượng</label><input id="sl" inputMode="decimal" required value={v.soLuong || ''} onChange={(e) => set('soLuong', so(e.target.value))} /></div>
            <div><label htmlFor="dv">Đơn vị</label><select id="dv" value={v.donVi} onChange={(e) => set('donVi', e.target.value)}><option value="tan">tấn</option><option value="kg">kg</option></select></div>
            <div><label htmlFor="thg">Tháng giao mong muốn</label><input id="thg" type="month" value={v.thangGiao} onChange={(e) => set('thangGiao', e.target.value)} /></div>
            <div><label htmlFor="ic">Incoterms</label><select id="ic" value={v.incoterms} onChange={(e) => set('incoterms', e.target.value)}>{['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP'].map((i) => <option key={i}>{i}</option>)}</select></div>
            <div><label htmlFor="cden">Cảng đến</label><input id="cden" value={v.cangDen} onChange={(e) => set('cangDen', e.target.value)} /></div>
          </div>
          <div className="hang">
            <div><label htmlFor="gmt">Giá mục tiêu của người mua</label><input id="gmt" inputMode="decimal" value={v.giaMucTieu} onChange={(e) => set('giaMucTieu', e.target.value)} placeholder="theo đơn vị" /></div>
            <div><label htmlFor="tt">Tiền tệ</label><select id="tt" value={v.tienTe} onChange={(e) => set('tienTe', e.target.value)}>{['USD', 'EUR', 'CNY', 'VND'].map((t) => <option key={t}>{t}</option>)}</select></div>
            <div style={{ flexBasis: 260 }}><label htmlFor="cn">Chứng nhận yêu cầu</label><input id="cn" value={v.chungNhan} onChange={(e) => set('chungNhan', e.target.value)} placeholder="Rainforest, hữu cơ, EUDR…" /></div>
          </div>
          <label htmlFor="qc">Quy cách</label>
          <textarea id="qc" rows={2} value={v.quyCach} onChange={(e) => set('quyCach', e.target.value)} />
          <label htmlFor="gc">Ghi chú</label>
          <textarea id="gc" rows={2} value={v.ghiChu} onChange={(e) => set('ghiChu', e.target.value)} />
          <button style={{ marginTop: 16 }}>Tạo phiếu</button>
        </form>
      )}

      <div className="bang-cuon" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Số</th><th>Ngày nhận</th><th>Người mua</th><th>Mặt hàng</th><th>Số lượng</th><th>Giá mục tiêu</th><th>Tháng giao</th><th>Hạn báo giá</th><th>Phụ trách</th><th>Trạng thái</th></tr></thead>
          <tbody>
            {ds.map((i) => (
              <tr key={i.id}>
                <td><Link href={`/ban-hang/hoi-hang/${i.id}`}>{i.code}</Link><div className="phu">{NGUON_HOI_HANG[i.source]}</div></td>
                <td>{ngay(i.receivedOn)}</td>
                <td>{i.partnerName} <span className="phu">({i.partnerCountry})</span></td>
                <td>{i.commodityName}</td>
                <td>{tien(i.quantity)} {i.unit === 'tan' ? 'tấn' : 'kg'}</td>
                <td>{i.targetPrice ? tien(i.targetPrice, i.currency ?? 'USD') : '—'}</td>
                <td>{i.deliveryMonth ?? '—'}</td>
                <td>{i.status === 'moi' ? ngay(i.hanBaoGia) : '—'}</td>
                <td>{i.ownerName}</td>
                <td><NhanHoiHang s={i.status} quaHan={i.quaHan} />{i.status === 'thua' && i.lostReason && <div className="phu">{LY_DO_THUA[i.lostReason]}</div>}</td>
              </tr>
            ))}
            {ds.length === 0 && <tr><td colSpan={10} className="phu">Chưa có phiếu hỏi hàng nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </KhungTrang>
  );
}
