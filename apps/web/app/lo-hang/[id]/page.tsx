'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BanHangLo } from '@/lib/ban-hang';
import { ChecklistChungTu } from '@/lib/chung-tu';
import { GoiEudrLo } from '@/lib/goi-eudr';
import { TruyXuatLo } from '@/lib/truy-xuat';
import { KhieuNaiLo, QuyetToanLo, ThuChiLo } from '@/lib/thanh-toan';
import { CacBuoc, Den, kg, LOAI_GIAO_DICH, NhatKy, SuKienLo, THI_TRUONG, TRANG_THAI_LO_XUAT } from '@/lib/lo-hang';
import { ngay, ngayGio } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface PhanBo {
  id: string;
  purchaseLotId: string;
  lotCode: string;
  supplierName: string;
  growingAreaCode: string | null;
  packingFacilityCode: string | null;
  quantityKg: number;
  createdByName: string;
  approvedByName: string | null;
  approvedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  biChia: boolean;
  nccDongY: boolean;
  coTheDuyet: boolean;
}
interface Booking {
  carrier: string;
  bookingNumber: string;
  vesselVoyage: string | null;
  cutoffSi: string | null;
  cutoffVgm: string | null;
  cutoffCargo: string | null;
  containers: { so: string; chi: string | null }[];
}
interface LoXuat {
  id: string;
  code: string;
  dealType: string;
  status: string;
  market: string;
  commodityId: string;
  commodityName: string;
  buyerName: string;
  counterContractId: string;
  contractCode: string;
  ownerName: string;
  etd: string | null;
  eta: string | null;
  blNumber: string | null;
  shippedOn: string | null;
  cancelReason: string | null;
  hopDong: { soLuongKg: number; dungSaiPhanTram: number };
  allocatedKg: number;
  phanBo: PhanBo[];
  nhaCungCapChinh: { id: string | null; ten: string | null; canChon: boolean } | null;
  booking: Booking | null;
  ngayDenCutoff: number | null;
  den: 'do' | 'vang' | 'xanh';
  buocKe: string | null;
  thieuDeChuyen: string[];
  suKien: SuKienLo[];
  quyen: { capNhat: boolean; phanBo: boolean; giamDinh: boolean; booking: boolean; chuyenBuoc: boolean; huy: boolean };
}
interface LoMuaConHang { id: string; code: string; supplierName: string; commodityId: string; dealType: string; unallocatedKg: number; growingAreaCode: string | null }

/** Đổi thời điểm ISO sang giá trị ô datetime-local theo giờ máy. */
function choO(v: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const raISO = (v: string) => (v ? new Date(v).toISOString() : null);

export default function ChiTietLoXuat() {
  const toi = useToi();
  const { id } = useParams<{ id: string }>();
  const [lo, setLo] = useState<LoXuat | null>(null);
  const [loMua, setLoMua] = useState<LoMuaConHang[]>([]);
  const [loi, setLoi] = useState('');
  const [thongBao, setThongBao] = useState('');
  const [pb, setPb] = useState({ loMuaId: '', khoiLuongKg: '' });
  const [gd, setGd] = useState({ ketQua: 'dat', donViGiamDinh: '', soChungThu: '', ghiChu: '' });
  const [bk, setBk] = useState({ hangTau: '', soBooking: '', tauChuyen: '', cutoffSi: '', cutoffVgm: '', cutoffHang: '', container: '' });
  const [vd, setVd] = useState({ soVanDon: '', ngayTauChay: '' });
  const [lyDo, setLyDo] = useState('');
  const [doiTien, setDoiTien] = useState(0);

  const tai = useCallback(async () => {
    const r = await api<LoXuat>(`/lo-xuat/${id}`);
    setLo(r);
    if (r.booking) {
      setBk({
        hangTau: r.booking.carrier,
        soBooking: r.booking.bookingNumber,
        tauChuyen: r.booking.vesselVoyage ?? '',
        cutoffSi: choO(r.booking.cutoffSi),
        cutoffVgm: choO(r.booking.cutoffVgm),
        cutoffHang: choO(r.booking.cutoffCargo),
        container: r.booking.containers.map((c) => (c.chi ? `${c.so} ${c.chi}` : c.so)).join('\n'),
      });
    }
    if (r.quyen.phanBo) {
      const m = await api<{ loMua: LoMuaConHang[] }>(`/lo-mua?conHang=1&loai=${r.dealType}&matHangId=${r.commodityId}`);
      setLoMua(m.loMua);
    }
  }, [id]);

  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  async function lam(fn: () => Promise<unknown>, xong: string) {
    setLoi('');
    setThongBao('');
    try {
      await fn();
      setPb({ loMuaId: '', khoiLuongKg: '' });
      setLyDo('');
      await tai();
      setThongBao(xong);
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  if (!toi) return null;
  if (!lo) return <KhungTrang toi={toi}>{loi ? <div className="loi">{loi}</div> : <p className="phu">Đang tải…</p>}</KhungTrang>;

  const so = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));
  const min = Math.round(lo.hopDong.soLuongKg * (1 - lo.hopDong.dungSaiPhanTram / 100));
  const max = Math.round(lo.hopDong.soLuongKg * (1 + lo.hopDong.dungSaiPhanTram / 100));
  const sangXepTau = lo.buocKe === 'xep_tau';

  function luuBooking(e: FormEvent) {
    e.preventDefault();
    const container = bk.container
      .split('\n')
      .map((d) => d.trim().split(/[\s,;]+/))
      .filter((p) => p[0])
      .map(([soCont, chi]) => ({ so: soCont.toUpperCase(), chi: chi || null }));
    lam(
      () =>
        api(`/lo-xuat/${id}/booking`, {
          method: 'PUT',
          body: { hangTau: bk.hangTau, soBooking: bk.soBooking, tauChuyen: bk.tauChuyen || null, cutoffSi: raISO(bk.cutoffSi), cutoffVgm: raISO(bk.cutoffVgm), cutoffHang: raISO(bk.cutoffHang), container },
        }),
      'Đã lưu booking.',
    );
  }

  return (
    <KhungTrang toi={toi}>
      <p><Link href="/lo-hang">← Bảng điều phối</Link></p>
      <h1><Den mau={lo.den} />{lo.code} <span style={{ fontSize: 16 }}>{TRANG_THAI_LO_XUAT[lo.status]}</span></h1>
      <p className="phu">
        {LOAI_GIAO_DICH[lo.dealType]} · hợp đồng đối ứng <Link href={`/hop-dong/${lo.counterContractId}`}>{lo.contractCode}</Link> · phụ trách: {lo.ownerName}
      </p>
      {lo.status !== 'da_huy' && <CacBuoc hienTai={lo.status} />}
      {lo.status === 'da_huy' && <div className="loi">Đã huỷ: {lo.cancelReason}</div>}
      {thongBao && <div className="dat" role="status">{thongBao}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}

      <div className="luoi" style={{ marginTop: 16 }}>
        <div className="o">
          <strong>Người mua, thị trường</strong>
          <div>{lo.buyerName}</div>
          <div>{lo.commodityName} · {THI_TRUONG[lo.market]}</div>
          <div className="phu">ETD {ngay(lo.etd)} · ETA {ngay(lo.eta)}</div>
          {lo.blNumber && <div>Vận đơn {lo.blNumber}, tàu chạy {ngay(lo.shippedOn)}</div>}
        </div>
        <div className="o">
          <strong>Khối lượng</strong>
          <div>Hợp đồng: {kg(lo.hopDong.soLuongKg)} (±{lo.hopDong.dungSaiPhanTram}%)</div>
          <div>Đã phân bổ: <strong>{kg(lo.allocatedKg)}</strong></div>
          <div className="phu">Được phép từ {kg(min)} đến {kg(max)}</div>
        </div>
        <div className="o">
          <strong>Cut-off</strong>
          {lo.booking ? (
            <>
              <div>{lo.ngayDenCutoff === null ? 'Chưa nhập mốc' : lo.ngayDenCutoff < 0 ? `Đã quá ${-lo.ngayDenCutoff} ngày` : `Còn ${lo.ngayDenCutoff} ngày`}</div>
              <div className="phu">SI {ngayGio(lo.booking.cutoffSi)} · hàng {ngayGio(lo.booking.cutoffCargo)}</div>
            </>
          ) : (
            <div className="phu">Chưa có booking.</div>
          )}
        </div>
      </div>

      {lo.buocKe && lo.status !== 'da_huy' && (
        <div className="o" style={{ marginTop: 16 }}>
          <strong>Sang bước kế: {TRANG_THAI_LO_XUAT[lo.buocKe]}</strong>
          {lo.thieuDeChuyen.length > 0 ? (
            <ul style={{ margin: '8px 0 0' }}>{lo.thieuDeChuyen.map((t) => <li key={t} className="kyc-canh-bao">{t}</li>)}</ul>
          ) : (
            <p className="kyc-dat" style={{ margin: '8px 0' }}>Đã đủ điều kiện.</p>
          )}
          {lo.quyen.chuyenBuoc && !sangXepTau && (
            <button style={{ marginTop: 8 }} onClick={() => lam(() => api(`/lo-xuat/${id}/chuyen-buoc`, { body: {} }), `Đã chuyển sang bước ${TRANG_THAI_LO_XUAT[lo.buocKe!]}.`)}>
              Chuyển sang {TRANG_THAI_LO_XUAT[lo.buocKe]}
            </button>
          )}
          {lo.quyen.chuyenBuoc && sangXepTau && (
            <form onSubmit={(e) => { e.preventDefault(); lam(() => api(`/lo-xuat/${id}/chuyen-buoc`, { body: vd }), 'Đã ghi xếp tàu.'); }}>
              <div className="hang">
                <div><label htmlFor="vd">Số vận đơn</label><input id="vd" required value={vd.soVanDon} onChange={(e) => setVd({ ...vd, soVanDon: e.target.value })} /></div>
                <div><label htmlFor="ntc">Ngày tàu chạy</label><input id="ntc" type="date" required value={vd.ngayTauChay} onChange={(e) => setVd({ ...vd, ngayTauChay: e.target.value })} /></div>
                <button>Ghi xếp tàu</button>
              </div>
            </form>
          )}
        </div>
      )}

      <h2>Hàng lấy từ các lô mua</h2>
      {lo.nhaCungCapChinh && (
        <p>
          Nhà cung cấp chính (đứng tên người gửi hàng trên vận đơn):{' '}
          {lo.nhaCungCapChinh.ten ? <strong>{lo.nhaCungCapChinh.ten}</strong> : <span className="kyc-canh-bao">hai nhà cung cấp góp bằng nhau, điều phối viên cần chọn</span>}
        </p>
      )}
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Lô mua</th><th>Nhà cung cấp, vùng trồng</th><th>Khối lượng</th><th>Duyệt</th><th>Chia lô</th><th></th></tr></thead>
          <tbody>
            {lo.phanBo.length === 0 && <tr><td colSpan={6} className="phu">Chưa phân bổ.</td></tr>}
            {lo.phanBo.map((p) => (
              <tr key={p.id} className={p.cancelledAt ? 'huy' : ''}>
                <td><Link href={`/lo-hang/lo-mua/${p.purchaseLotId}`}>{p.lotCode}</Link><div className="phu">tạo bởi {p.createdByName}</div></td>
                <td>{p.supplierName}<div className="phu">{p.growingAreaCode ? `Vùng trồng ${p.growingAreaCode}` : 'Chưa có mã vùng trồng'}</div></td>
                <td>{kg(p.quantityKg)}</td>
                <td>{p.cancelledAt ? `Huỷ: ${p.cancelReason}` : p.approvedAt ? <span className="kyc-dat">{p.approvedByName}</span> : <span className="phu">Chờ Trưởng phòng</span>}</td>
                <td>{p.cancelledAt ? '' : !p.biChia ? <span className="phu">Không chia</span> : p.nccDongY ? <span className="kyc-dat">NCC đã đồng ý</span> : <span className="kyc-canh-bao">Chờ NCC đồng ý</span>}</td>
                <td>
                  <div className="hang" style={{ gap: 6 }}>
                    {p.coTheDuyet && <button className="nho" onClick={() => lam(() => api(`/phan-bo/${p.id}/duyet`, { method: 'POST' }), 'Đã duyệt phân bổ.')}>Duyệt</button>}
                    {lo.quyen.phanBo && !p.cancelledAt && (
                      <button className="phu-btn nho" onClick={() => { const l = window.prompt('Lý do huỷ phân bổ'); if (l) lam(() => api(`/phan-bo/${p.id}/huy`, { body: { lyDo: l } }), 'Đã huỷ phân bổ.'); }}>Huỷ</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lo.quyen.phanBo && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); lam(() => api(`/lo-xuat/${id}/phan-bo`, { body: { loMuaId: pb.loMuaId, khoiLuongKg: so(pb.khoiLuongKg) } }), 'Đã thêm phân bổ, chờ Trưởng phòng duyệt.'); }}>
          <strong>Phân bổ thêm hàng</strong>
          <div className="hang">
            <div>
              <label htmlFor="lm">Lô mua còn hàng (cùng mặt hàng, cùng loại giao dịch)</label>
              <select id="lm" required value={pb.loMuaId} onChange={(e) => setPb({ ...pb, loMuaId: e.target.value })}>
                <option value="">Chọn lô mua</option>
                {loMua.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.supplierName} · còn {kg(m.unallocatedKg)}</option>)}
              </select>
            </div>
            <div><label htmlFor="pbkl">Khối lượng (kg)</label><input id="pbkl" inputMode="decimal" required value={pb.khoiLuongKg} onChange={(e) => setPb({ ...pb, khoiLuongKg: e.target.value })} /></div>
            <button>Thêm phân bổ</button>
          </div>
          <p className="phu">Nếu một lô mua được chia cho từ hai người mua trở lên, phải ghi xác nhận đồng ý của nhà cung cấp ở trang lô mua trước khi giám định.</p>
        </form>
      )}

      {lo.quyen.giamDinh && (
        <form className="o" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); lam(() => api(`/lo-xuat/${id}/giam-dinh`, { body: { ...gd, soChungThu: gd.soChungThu || null, ghiChu: gd.ghiChu || null } }), 'Đã ghi kết quả giám định.'); }}>
          <strong>Ghi kết quả giám định</strong>
          <div className="hang">
            <div>
              <label htmlFor="kq">Kết quả</label>
              <select id="kq" value={gd.ketQua} onChange={(e) => setGd({ ...gd, ketQua: e.target.value })}><option value="dat">Đạt</option><option value="khong_dat">Không đạt</option></select>
            </div>
            <div><label htmlFor="dvgd">Đơn vị giám định</label><input id="dvgd" required value={gd.donViGiamDinh} onChange={(e) => setGd({ ...gd, donViGiamDinh: e.target.value })} placeholder="VD: Vinacontrol" /></div>
            <div><label htmlFor="sct">Số chứng thư</label><input id="sct" value={gd.soChungThu} onChange={(e) => setGd({ ...gd, soChungThu: e.target.value })} /></div>
          </div>
          <label htmlFor="gdgc">Ghi chú (chỉ tiêu không đạt, hướng xử lý)</label>
          <input id="gdgc" value={gd.ghiChu} onChange={(e) => setGd({ ...gd, ghiChu: e.target.value })} />
          <button style={{ marginTop: 12 }}>Ghi kết quả</button>
        </form>
      )}

      {lo.quyen.booking && (
        <form className="o" style={{ marginTop: 16 }} onSubmit={luuBooking}>
          <strong>Booking và container</strong>
          <div className="hang">
            <div><label htmlFor="ht">Hãng tàu hoặc forwarder</label><input id="ht" required value={bk.hangTau} onChange={(e) => setBk({ ...bk, hangTau: e.target.value })} /></div>
            <div><label htmlFor="sb">Số booking</label><input id="sb" required value={bk.soBooking} onChange={(e) => setBk({ ...bk, soBooking: e.target.value })} /></div>
            <div><label htmlFor="tc">Tàu, chuyến</label><input id="tc" value={bk.tauChuyen} onChange={(e) => setBk({ ...bk, tauChuyen: e.target.value })} /></div>
          </div>
          <div className="hang">
            <div><label htmlFor="csi">Cut-off SI</label><input id="csi" type="datetime-local" value={bk.cutoffSi} onChange={(e) => setBk({ ...bk, cutoffSi: e.target.value })} /></div>
            <div><label htmlFor="cvgm">Cut-off VGM</label><input id="cvgm" type="datetime-local" value={bk.cutoffVgm} onChange={(e) => setBk({ ...bk, cutoffVgm: e.target.value })} /></div>
            <div><label htmlFor="ch">Cut-off hàng</label><input id="ch" type="datetime-local" value={bk.cutoffHang} onChange={(e) => setBk({ ...bk, cutoffHang: e.target.value })} /></div>
          </div>
          <label htmlFor="ct">Container, mỗi dòng: số container rồi số chì (thêm số chì khi đã kẹp chì)</label>
          <textarea id="ct" rows={3} value={bk.container} onChange={(e) => setBk({ ...bk, container: e.target.value })} placeholder={'MSKU1234567 ML-778899\nMSKU7654321'} />
          <button style={{ marginTop: 12 }}>Lưu booking</button>
        </form>
      )}

      {lo.quyen.huy && (
        <details style={{ marginTop: 16 }}>
          <summary>Huỷ lô xuất</summary>
          <form className="o" style={{ marginTop: 8, maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); lam(() => api(`/lo-xuat/${id}/huy`, { body: { lyDo } }), 'Đã huỷ lô; hàng đã phân bổ trả về các lô mua.'); }}>
            <label htmlFor="ld">Lý do huỷ</label>
            <input id="ld" required minLength={3} value={lyDo} onChange={(e) => setLyDo(e.target.value)} />
            <button className="phu-btn" style={{ marginTop: 12 }}>Xác nhận huỷ</button>
          </form>
        </details>
      )}

      {lo.status !== 'da_huy' && <BanHangLo loId={lo.id} onDoi={() => tai().catch((e: Error) => setLoi(e.message))} />}

      {lo.status !== 'da_huy' && (
        <>
          <h2>Truy xuất nguồn gốc</h2>
          <TruyXuatLo loId={lo.id} />
        </>
      )}

      {lo.market === 'EU' && lo.status !== 'da_huy' && (
        <>
          <h2>Gói dữ liệu EUDR</h2>
          <GoiEudrLo loId={lo.id} />
        </>
      )}

      {lo.status !== 'da_huy' && (
        <>
          <h2>Chứng từ</h2>
          <ChecklistChungTu loId={lo.id} onDoi={() => tai().catch((e: Error) => setLoi(e.message))} />
        </>
      )}
      {lo.blNumber && (
        <p style={{ marginTop: 16 }}><Link href={`/lo-hang/thu-phi?loXuatId=${lo.id}`}>Đề nghị thu phí của lô này</Link></p>
      )}

      {lo.status !== 'da_huy' && toi.quyen.some((q) => q === 'PHI_XEM_TAT_CA' || q === 'PHI_XEM_CUA_MINH') && (
        <>
          <h2>Thu chi và tài trợ</h2>
          <ThuChiLo key={`tc${doiTien}`} loId={lo.id} loaiGiaoDich={lo.dealType} loMua={lo.phanBo} />
          {(lo.status === 'xep_tau' || lo.status === 'hoan_tat') && (
            <>
              <h2>Khiếu nại sau giao hàng</h2>
              <KhieuNaiLo loId={lo.id} onDoi={() => setDoiTien((v) => v + 1)} />
              <h2>Quyết toán lô</h2>
              <QuyetToanLo loId={lo.id} version={doiTien} />
            </>
          )}
        </>
      )}

      <h2>Nhật ký lô</h2>
      <NhatKy suKien={lo.suKien} />
    </KhungTrang>
  );
}

