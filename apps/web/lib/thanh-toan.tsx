'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { ngay, ngayGio, tien } from './nhan';

// ---------- Nhãn ----------

export const LOAI_KHOAN: Record<string, string> = {
  tien_hang_nguoi_mua: 'Tiền hàng người mua trả',
  tien_hang_ncc: 'Tiền hàng trả nhà cung cấp',
  tien_hang_truc_tiep: 'Người mua trả thẳng nhà cung cấp',
  phi_tron_goi: 'Phí trọn gói',
  phi_thu_xep_von: 'Phí thu xếp vốn',
  tra_ngan_hang: 'Trả nợ ngân hàng',
  chi_phi: 'Chi phí của lô',
};
export const MOC: Record<string, string> = {
  dat_coc: 'Khi ký hợp đồng (đặt cọc)',
  giam_dinh: 'Khi giám định đạt',
  van_don: 'Khi có vận đơn',
  chung_tu: 'Khi bộ chứng từ hoàn tất',
  giai_ngan: 'Khi ngân hàng giải ngân',
  ngay: 'Theo ngày',
};
const HANG_MUC: Record<string, string> = {
  van_tai_noi_dia: 'Vận tải nội địa',
  thu_tuc_xuat_khau: 'Thủ tục xuất khẩu',
  xep_hang: 'Xếp hàng',
  cuoc_bien: 'Cước biển',
  bao_hiem: 'Bảo hiểm',
  giam_dinh: 'Giám định',
  so_che_dong_goi: 'Sơ chế, đóng gói',
  kho: 'Kho',
  khac: 'Khác',
};
const LOAI_TAI_TRO: Record<string, string> = { truoc_xuat_khau: 'Tài trợ trước xuất khẩu', lc: 'Theo L/C', luu_kho: 'Tài trợ hàng lưu kho', chiet_khau: 'Chiết khấu khoản phải thu' };
const TT_TAI_TRO: Record<string, string> = { du_kien: 'Dự kiến', da_giai_ngan: 'Đã giải ngân', da_tat_toan: 'Đã tất toán', da_huy: 'Đã huỷ' };
const LOAI_KN: Record<string, string> = { so_luong: 'Thiếu số lượng', chat_luong: 'Chất lượng', chung_tu: 'Chứng từ', cham_giao: 'Chậm giao' };
const LOI: Record<string, string> = { ncc: 'Nhà cung cấp (hàng hoá)', van_chuyen: 'Vận chuyển, bảo hiểm', nguoi_mua: 'Người mua', van_thuan: 'Vạn Thuận', khong_co_loi: 'Không có lỗi' };
const TIEN_TE = ['USD', 'VND', 'EUR', 'CNY'];
const usd = (v: number | null | undefined) => tien(v, 'USD');
const so = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));

function useTai<T>(path: string) {
  const [d, setD] = useState<T | null>(null);
  const [loi, setLoi] = useState('');
  const [tb, setTb] = useState('');
  const tai = useCallback(async () => setD(await api<T>(path)), [path]);
  useEffect(() => {
    tai().catch((e: Error) => setLoi(e.message));
  }, [tai]);
  async function lam(fn: () => Promise<unknown>, xong: string, sau?: () => void) {
    setLoi('');
    setTb('');
    try {
      await fn();
      await tai();
      sau?.();
      setTb(xong);
    } catch (e) {
      setLoi((e as Error).message);
    }
  }
  return { d, loi, tb, lam, tai };
}

function ThongBao({ loi, tb }: { loi: string; tb: string }) {
  return (
    <>
      {tb && <div className="dat" role="status">{tb}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}
    </>
  );
}

// ---------- Thu chi theo lô ----------

interface Khoan {
  id: string;
  kind: string;
  ten: string;
  category: string | null;
  partnerName: string | null;
  purchaseLotCode: string | null;
  milestone: string;
  dueDate: string | null;
  plannedAmount: number;
  currency: string;
  status: string;
  paidAmount: number | null;
  paidOn: string | null;
  fxPerUsd: number | null;
  paidUsd: number | null;
  reference: string | null;
  note: string | null;
  recordedByName: string | null;
  overpayApprovedByName: string | null;
  overpayReason: string | null;
  cancelReason: string | null;
  denHan: boolean;
  quyen: { ghiNhan: boolean; huy: boolean; duyetVuot: boolean };
}
interface TaiTro {
  id: string;
  kind: string;
  bankName: string;
  borrowerName: string;
  amount: number;
  currency: string;
  feeRatePct: number;
  phiThuXepVon: number;
  status: string;
  disbursedOn: string | null;
  dueOn: string;
  repaidOn: string | null;
  collateral: string | null;
  quyen: { giaiNgan: boolean; huy: boolean };
}
interface ThuChi {
  dong: Khoan[];
  taiTro: TaiTro[];
  tongHop: Record<string, number | null>;
  hanMucTraNccUsd: { hanMucUsd: number; daTraUsd: number; conLaiUsd: number } | null;
  khoa: boolean;
  quyen: { lapLich: boolean; taiTro: boolean };
}
interface LoMuaLo { purchaseLotId: string; lotCode: string; supplierName: string; cancelledAt: string | null }

/** Trên trang lô xuất: lịch thu chi theo mốc, ghi nhận tiền thực về, tài trợ ngân hàng. */
export function ThuChiLo({ loId, loaiGiaoDich, loMua }: { loId: string; loaiGiaoDich: string; loMua: LoMuaLo[] }) {
  const { d, loi, tb, lam } = useTai<ThuChi>(`/lo-xuat/${loId}/thanh-toan`);
  const trong = { loai: loaiGiaoDich === 'mua_dut' ? 'tien_hang_nguoi_mua' : 'tien_hang_truc_tiep', loMuaId: '', moc: 'chung_tu', ngayDenHan: '', soTien: '', tienTe: 'USD', hangMuc: 'cuoc_bien', ghiChu: '' };
  const [k, setK] = useState(trong);
  const [gn, setGn] = useState<{ id: string; soTien: string; ngay: string; tyGia: string; soThamChieu: string } | null>(null);
  const [nganHang, setNganHang] = useState<{ id: string; name: string }[]>([]);
  const [benVay, setBenVay] = useState<{ id: string; name: string }[]>([]);
  const [tt, setTt] = useState({ nganHangId: '', benVayId: '', loai: 'truoc_xuat_khau', soTien: '', tienTe: 'USD', tyGia: '', tyLePhiPhanTram: '1', ngayDaoHan: '', taiSanBaoDam: '' });

  useEffect(() => {
    if (!d?.quyen.taiTro) return;
    api<{ doiTac: { id: string; name: string }[] }>('/doi-tac?vai=ngan_hang&kyc=dat').then((r) => setNganHang(r.doiTac)).catch(() => undefined);
    api<{ doiTac: { id: string; name: string }[] }>('/doi-tac?kyc=dat').then((r) => setBenVay(r.doiTac)).catch(() => undefined);
  }, [d?.quyen.taiTro]);

  if (!d) return loi ? <div className="loi">{loi}</div> : <p className="phu">Đang tải…</p>;
  const loaiDung = Object.keys(LOAI_KHOAN).filter((x) => !['phi_thu_xep_von', 'tra_ngan_hang'].includes(x) && (loaiGiaoDich === 'mua_dut' ? x !== 'tien_hang_truc_tiep' : !['tien_hang_nguoi_mua', 'tien_hang_ncc'].includes(x)));
  const canLoMua = ['tien_hang_ncc', 'tien_hang_truc_tiep', 'phi_tron_goi'].includes(k.loai);
  const th = d.tongHop;

  function lapLich(e: FormEvent) {
    e.preventDefault();
    lam(
      () =>
        api(`/lo-xuat/${loId}/thanh-toan`, {
          body: { loai: k.loai, loMuaId: canLoMua ? k.loMuaId : null, moc: k.moc, ngayDenHan: k.moc === 'ngay' ? k.ngayDenHan : null, soTien: so(k.soTien), tienTe: k.tienTe, hangMuc: k.loai === 'chi_phi' ? k.hangMuc : null, ghiChu: k.ghiChu || null },
        }),
      'Đã thêm khoản vào lịch thu chi.',
      () => setK(trong),
    );
  }
  function ghiNhan(e: FormEvent) {
    e.preventDefault();
    if (!gn) return;
    lam(() => api(`/thanh-toan/${gn.id}/ghi-nhan`, { body: { soTien: so(gn.soTien), ngay: gn.ngay, tyGia: gn.tyGia ? so(gn.tyGia) : null, soThamChieu: gn.soThamChieu || null } }), 'Đã ghi nhận.', () => setGn(null));
  }
  function themTaiTro(e: FormEvent) {
    e.preventDefault();
    lam(
      () => api(`/lo-xuat/${loId}/tai-tro`, { body: { ...tt, soTien: so(tt.soTien), tyGia: tt.tyGia ? so(tt.tyGia) : null, tyLePhiPhanTram: so(tt.tyLePhiPhanTram), taiSanBaoDam: tt.taiSanBaoDam || null } }),
      'Đã ghi khoản tài trợ. Khi ngân hàng giải ngân, bấm "Ghi giải ngân" để lập phí thu xếp vốn.',
    );
  }

  return (
    <div>
      {d.khoa && <div className="dat">Lô đang chờ duyệt hoặc đã quyết toán: số liệu thu chi đã khoá.</div>}
      <div className="luoi" style={{ marginTop: 12 }}>
        <div className="o">
          <strong>{loaiGiaoDich === 'mua_dut' ? 'Người mua' : 'Người mua trả nhà cung cấp'}</strong>
          <div>Phải trả {usd(th.phaiThuNguoiMuaUsd)}{th.giamTruKhieuNaiUsd ? <span className="phu"> (đã giảm trừ {usd(th.giamTruKhieuNaiUsd)})</span> : null}</div>
          <div>{loaiGiaoDich === 'mua_dut' ? 'Đã thu' : 'Đã xác nhận'} <strong>{usd(th.daThuNguoiMuaUsd)}</strong></div>
        </div>
        {loaiGiaoDich === 'mua_dut' && (
          <div className="o">
            <strong>Nhà cung cấp</strong>
            <div>Phải trả {usd(th.phaiTraNccUsd)} · đã trả <strong>{usd(th.daTraNccUsd)}</strong></div>
            {d.hanMucTraNccUsd && <div className={d.hanMucTraNccUsd.conLaiUsd <= 0 ? 'kyc-canh-bao' : 'phu'}>Còn được trả {usd(d.hanMucTraNccUsd.conLaiUsd)} (không vượt số đã thu hoặc số tài trợ đã giải ngân)</div>}
          </div>
        )}
        <div className="o">
          <strong>Phí</strong>
          <div>Phí trọn gói: phải thu {usd(th.phiPhaiThuUsd)} · đã thu <strong>{usd(th.phiDaThuUsd)}</strong></div>
          {th.phiThuXepVonPhaiThuUsd ? <div>Phí thu xếp vốn: phải thu {usd(th.phiThuXepVonPhaiThuUsd)} · đã thu <strong>{usd(th.phiThuXepVonDaThuUsd)}</strong></div> : null}
        </div>
      </div>
      <ThongBao loi={loi} tb={tb} />

      <div className="bang-cuon" style={{ marginTop: 12 }}>
        <table>
          <thead><tr><th>Khoản</th><th>Bên trả hoặc nhận</th><th>Mốc</th><th>Dự kiến</th><th>Thực hiện</th><th></th></tr></thead>
          <tbody>
            {d.dong.length === 0 && <tr><td colSpan={6} className="phu">Chưa lập lịch thu chi.</td></tr>}
            {d.dong.map((r) => (
              <tr key={r.id} className={r.status === 'da_huy' ? 'huy' : ''}>
                <td>{r.ten}{r.category && <div className="phu">{HANG_MUC[r.category]}</div>}{r.note && <div className="phu">{r.note}</div>}</td>
                <td>{r.partnerName ?? '—'}{r.purchaseLotCode && <div className="phu">lô mua {r.purchaseLotCode}</div>}</td>
                <td>{MOC[r.milestone]}{r.dueDate && <div className="phu">{ngay(r.dueDate)}</div>}{r.denHan && <div className="kyc-canh-bao">Đến hạn</div>}</td>
                <td>{tien(r.plannedAmount, r.currency)}</td>
                <td>
                  {r.status === 'da_thuc_hien' && (
                    <>
                      {tien(r.paidAmount, r.currency)} <span className="phu">ngày {ngay(r.paidOn)}</span>
                      {r.currency !== 'USD' && <div className="phu">tỷ giá {tien(r.fxPerUsd)} = {usd(r.paidUsd)}</div>}
                      <div className="phu">{r.reference ? `${r.reference} · ` : ''}{r.recordedByName}</div>
                    </>
                  )}
                  {r.status === 'da_huy' && <span className="phu">Huỷ: {r.cancelReason}</span>}
                  {r.status === 'du_kien' && r.kind === 'tien_hang_truc_tiep' && <span className="phu">Chờ nhà cung cấp xác nhận trên cổng</span>}
                  {r.overpayApprovedByName && <div className="phu">Giám đốc {r.overpayApprovedByName} cho trả vượt: {r.overpayReason}</div>}
                </td>
                <td>
                  <div className="hang" style={{ gap: 6 }}>
                    {r.quyen.ghiNhan && <button className="nho" onClick={() => setGn({ id: r.id, soTien: String(r.plannedAmount), ngay: '', tyGia: '', soThamChieu: '' })}>Ghi nhận</button>}
                    {r.quyen.duyetVuot && <button className="nho" onClick={() => { const l = window.prompt('Lý do cho trả nhà cung cấp vượt số đã thu'); if (l) lam(() => api(`/thanh-toan/${r.id}/duyet-vuot`, { body: { lyDo: l } }), 'Đã cho phép trả vượt khoản này.'); }}>Cho trả vượt</button>}
                    {r.quyen.huy && <button className="phu-btn nho" onClick={() => { const l = window.prompt('Lý do huỷ khoản'); if (l) lam(() => api(`/thanh-toan/${r.id}/huy`, { body: { lyDo: l } }), 'Đã huỷ khoản.'); }}>Huỷ</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {gn && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={ghiNhan}>
          <strong>Ghi nhận tiền thực thu, thực chi</strong>
          <div className="hang">
            <div><label htmlFor="gnst">Số tiền</label><input id="gnst" inputMode="decimal" required value={gn.soTien} onChange={(e) => setGn({ ...gn, soTien: e.target.value })} /></div>
            <div><label htmlFor="gnng">Ngày</label><input id="gnng" type="date" required value={gn.ngay} onChange={(e) => setGn({ ...gn, ngay: e.target.value })} /></div>
            <div><label htmlFor="gntg">Tỷ giá thực tế (đơn vị tiền đổi 1 USD, bỏ trống nếu USD)</label><input id="gntg" inputMode="decimal" value={gn.tyGia} onChange={(e) => setGn({ ...gn, tyGia: e.target.value })} /></div>
            <div><label htmlFor="gnsc">Số chứng từ ngân hàng</label><input id="gnsc" value={gn.soThamChieu} onChange={(e) => setGn({ ...gn, soThamChieu: e.target.value })} /></div>
            <button>Ghi nhận</button>
            <button type="button" className="phu-btn" onClick={() => setGn(null)}>Thôi</button>
          </div>
          <p className="phu">Thu, chi ít hơn dự kiến thì phần còn lại tự thành một khoản mới cùng mốc.</p>
        </form>
      )}

      {d.quyen.lapLich && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={lapLich}>
          <strong>Thêm khoản vào lịch thu chi</strong>
          <div className="hang">
            <div>
              <label htmlFor="kl">Khoản</label>
              <select id="kl" value={k.loai} onChange={(e) => setK({ ...k, loai: e.target.value })}>{loaiDung.map((x) => <option key={x} value={x}>{LOAI_KHOAN[x]}</option>)}</select>
            </div>
            {canLoMua && (
              <div>
                <label htmlFor="klm">Lô mua (nhà cung cấp)</label>
                <select id="klm" required value={k.loMuaId} onChange={(e) => setK({ ...k, loMuaId: e.target.value })}>
                  <option value="">Chọn lô mua</option>
                  {loMua.filter((p) => !p.cancelledAt).map((p) => <option key={p.purchaseLotId} value={p.purchaseLotId}>{p.lotCode} · {p.supplierName}</option>)}
                </select>
              </div>
            )}
            {k.loai === 'chi_phi' && (
              <div>
                <label htmlFor="khm">Hạng mục</label>
                <select id="khm" value={k.hangMuc} onChange={(e) => setK({ ...k, hangMuc: e.target.value })}>{Object.entries(HANG_MUC).map(([m, t]) => <option key={m} value={m}>{t}</option>)}</select>
              </div>
            )}
            <div>
              <label htmlFor="kmoc">Đến hạn</label>
              <select id="kmoc" value={k.moc} onChange={(e) => setK({ ...k, moc: e.target.value })}>{Object.entries(MOC).filter(([m]) => m !== 'giai_ngan').map(([m, t]) => <option key={m} value={m}>{t}</option>)}</select>
            </div>
            {k.moc === 'ngay' && <div><label htmlFor="kng">Ngày đến hạn</label><input id="kng" type="date" required value={k.ngayDenHan} onChange={(e) => setK({ ...k, ngayDenHan: e.target.value })} /></div>}
          </div>
          <div className="hang">
            <div><label htmlFor="kst">Số tiền</label><input id="kst" inputMode="decimal" required value={k.soTien} onChange={(e) => setK({ ...k, soTien: e.target.value })} /></div>
            <div><label htmlFor="ktt">Tiền tệ</label><select id="ktt" value={k.tienTe} onChange={(e) => setK({ ...k, tienTe: e.target.value })}>{TIEN_TE.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div><label htmlFor="kgc">Ghi chú</label><input id="kgc" value={k.ghiChu} onChange={(e) => setK({ ...k, ghiChu: e.target.value })} /></div>
            <button>Thêm khoản</button>
          </div>
          {loaiGiaoDich === 'moi_gioi' && <p className="phu">Lô môi giới: Vạn Thuận không giữ tiền hàng. Khoản người mua trả thẳng nhà cung cấp do nhà cung cấp xác nhận đã nhận trên cổng.</p>}
        </form>
      )}

      <h3>Tài trợ ngân hàng</h3>
      {d.taiTro.length === 0 && <p className="phu">Lô không có khoản tài trợ.</p>}
      {d.taiTro.map((f) => (
        <div key={f.id} className="o" style={{ marginTop: 8 }}>
          <strong>{LOAI_TAI_TRO[f.kind]}</strong> <span className="nhan">{TT_TAI_TRO[f.status]}</span>
          <div>{f.bankName} cho {f.borrowerName} vay {tien(f.amount, f.currency)}, đáo hạn {ngay(f.dueOn)}</div>
          <div className="phu">Phí thu xếp vốn {f.feeRatePct}% = {tien(f.phiThuXepVon, f.currency)}, bên vay trả khi giải ngân{f.disbursedOn ? `; giải ngân ${ngay(f.disbursedOn)}` : ''}{f.repaidOn ? `; tất toán ${ngay(f.repaidOn)}` : ''}</div>
          {f.collateral && <div className="phu">Tài sản bảo đảm: {f.collateral}</div>}
          <div className="hang" style={{ gap: 6, marginTop: 6 }}>
            {f.quyen.giaiNgan && <button className="nho" onClick={() => { const n = window.prompt('Ngày ngân hàng giải ngân (YYYY-MM-DD)'); if (n) lam(() => api(`/tai-tro/${f.id}/giai-ngan`, { body: { ngay: n } }), 'Đã ghi giải ngân; đã lập khoản phí thu xếp vốn và khoản trả nợ.'); }}>Ghi giải ngân</button>}
            {f.quyen.huy && <button className="phu-btn nho" onClick={() => { const l = window.prompt('Lý do huỷ khoản tài trợ'); if (l) lam(() => api(`/tai-tro/${f.id}/huy`, { body: { lyDo: l } }), 'Đã huỷ khoản tài trợ.'); }}>Huỷ</button>}
          </div>
        </div>
      ))}
      {d.quyen.taiTro && (
        <details style={{ marginTop: 8 }}>
          <summary>Ghi khoản tài trợ mới</summary>
          <form className="o" style={{ marginTop: 8 }} onSubmit={themTaiTro}>
            <div className="hang">
              <div><label htmlFor="tnh">Ngân hàng</label><select id="tnh" required value={tt.nganHangId} onChange={(e) => setTt({ ...tt, nganHangId: e.target.value })}><option value="">Chọn ngân hàng</option>{nganHang.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label htmlFor="tbv">Bên vay (trả phí thu xếp vốn)</label><select id="tbv" required value={tt.benVayId} onChange={(e) => setTt({ ...tt, benVayId: e.target.value })}><option value="">Chọn bên vay</option>{benVay.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label htmlFor="tl">Hình thức</label><select id="tl" value={tt.loai} onChange={(e) => setTt({ ...tt, loai: e.target.value })}>{Object.entries(LOAI_TAI_TRO).map(([m, t]) => <option key={m} value={m}>{t}</option>)}</select></div>
            </div>
            <div className="hang">
              <div><label htmlFor="tst">Số tiền tài trợ</label><input id="tst" inputMode="decimal" required value={tt.soTien} onChange={(e) => setTt({ ...tt, soTien: e.target.value })} /></div>
              <div><label htmlFor="ttt">Tiền tệ</label><select id="ttt" value={tt.tienTe} onChange={(e) => setTt({ ...tt, tienTe: e.target.value })}>{TIEN_TE.map((t) => <option key={t}>{t}</option>)}</select></div>
              {tt.tienTe !== 'USD' && <div><label htmlFor="ttg">Tỷ giá quy USD</label><input id="ttg" inputMode="decimal" required value={tt.tyGia} onChange={(e) => setTt({ ...tt, tyGia: e.target.value })} /></div>}
              <div><label htmlFor="tpt">Phí thu xếp vốn (%)</label><input id="tpt" inputMode="decimal" required value={tt.tyLePhiPhanTram} onChange={(e) => setTt({ ...tt, tyLePhiPhanTram: e.target.value })} /></div>
              <div><label htmlFor="tdh">Ngày đáo hạn</label><input id="tdh" type="date" required value={tt.ngayDaoHan} onChange={(e) => setTt({ ...tt, ngayDaoHan: e.target.value })} /></div>
            </div>
            <label htmlFor="tts">Tài sản bảo đảm</label>
            <input id="tts" value={tt.taiSanBaoDam} onChange={(e) => setTt({ ...tt, taiSanBaoDam: e.target.value })} placeholder="VD: hàng trong kho, khoản phải thu theo hợp đồng bán" />
            <button style={{ marginTop: 12 }}>Ghi khoản tài trợ</button>
          </form>
        </details>
      )}
    </div>
  );
}

// ---------- Khiếu nại ----------

interface KhieuNai {
  id: string;
  code: string;
  kind: string;
  description: string;
  claimedAmount: number | null;
  currency: string;
  evidence: string | null;
  status: string;
  fault: string | null;
  agreedAmount: number | null;
  passBackLotCode: string | null;
  passBackAmount: number | null;
  amendmentRef: string | null;
  resolution: string | null;
  openedByName: string;
  openedAt: string;
  closedByName: string | null;
  closedAt: string | null;
  goiY: string | null;
  quyen: { dong: boolean };
}
interface DsKhieuNai { khieuNai: KhieuNai[]; giamDinhCangDi: string | null; tienTe: string; loMua: { id: string; code: string; supplierName: string }[]; quyen: { mo: boolean } }

export function KhieuNaiLo({ loId, onDoi }: { loId: string; onDoi?: () => void }) {
  const { d, loi, tb, lam } = useTai<DsKhieuNai>(`/lo-xuat/${loId}/khieu-nai`);
  const [m, setM] = useState({ loai: 'chat_luong', moTa: '', soTienYeuCau: '', bangChung: '' });
  const [dg, setDg] = useState<{ id: string; loi: string; soTienGiamTru: string; loMuaChuyenId: string; soTienChuyenNcc: string; soPhuLuc: string; ketLuan: string } | null>(null);
  if (!d) return loi ? <div className="loi">{loi}</div> : null;

  return (
    <div>
      <p className="phu">Giám định cảng đi: {d.giamDinhCangDi === 'dat' ? 'đạt' : d.giamDinhCangDi === 'khong_dat' ? 'không đạt' : 'chưa có'}. Lô còn khiếu nại mở thì chưa quyết toán được.</p>
      <ThongBao loi={loi} tb={tb} />
      {d.khieuNai.length === 0 && <p className="phu">Không có khiếu nại.</p>}
      {d.khieuNai.map((c) => (
        <div key={c.id} className="o" style={{ marginTop: 8 }}>
          <strong>{c.code}</strong> <span className="nhan">{LOAI_KN[c.kind]}</span> <span className="nhan">{c.status === 'mo' ? 'Đang mở' : 'Đã đóng'}</span>
          <div>{c.description}</div>
          <div className="phu">Mở bởi {c.openedByName}, {ngayGio(c.openedAt)}{c.claimedAmount ? ` · người mua yêu cầu ${tien(c.claimedAmount, c.currency)}` : ''}</div>
          {c.evidence && <div className="phu">Bằng chứng: {c.evidence}</div>}
          {c.goiY && <div className="kyc-canh-bao" style={{ fontWeight: 500 }}>Gợi ý: {c.goiY}</div>}
          {c.status === 'da_dong' && (
            <div style={{ marginTop: 6 }}>
              Kết luận: lỗi {LOI[c.fault!]?.toLowerCase()}, giảm trừ <strong>{tien(c.agreedAmount, c.currency)}</strong>{c.amendmentRef ? ` (phụ lục ${c.amendmentRef})` : ''}
              {c.passBackLotCode && <>; chuyển nhà cung cấp {tien(c.passBackAmount, c.currency)} (lô mua {c.passBackLotCode})</>}
              <div className="phu">{c.resolution} · {c.closedByName}, {ngayGio(c.closedAt)}</div>
            </div>
          )}
          {c.quyen.dong && <button className="nho" style={{ marginTop: 6 }} onClick={() => setDg({ id: c.id, loi: 'van_chuyen', soTienGiamTru: '0', loMuaChuyenId: '', soTienChuyenNcc: '', soPhuLuc: '', ketLuan: '' })}>Kết luận và đóng</button>}
          {dg?.id === c.id && (
            <form
              style={{ marginTop: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                lam(
                  () =>
                    api(`/khieu-nai/${c.id}/dong`, {
                      body: { loi: dg.loi, soTienGiamTru: so(dg.soTienGiamTru || '0'), loMuaChuyenId: dg.loMuaChuyenId || null, soTienChuyenNcc: dg.soTienChuyenNcc ? so(dg.soTienChuyenNcc) : null, soPhuLuc: dg.soPhuLuc || null, ketLuan: dg.ketLuan },
                    }),
                  'Đã đóng khiếu nại; kết luận đã ghi vào sổ cái hợp đồng đối ứng.',
                  () => { setDg(null); onDoi?.(); },
                );
              }}
            >
              <div className="hang">
                <div><label htmlFor="kloi">Lỗi do</label><select id="kloi" value={dg.loi} onChange={(e) => setDg({ ...dg, loi: e.target.value })}>{Object.entries(LOI).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
                <div><label htmlFor="kgt">Giảm trừ cho người mua ({c.currency})</label><input id="kgt" inputMode="decimal" value={dg.soTienGiamTru} onChange={(e) => setDg({ ...dg, soTienGiamTru: e.target.value })} /></div>
                <div><label htmlFor="kpl">Số phụ lục hợp đồng đối ứng</label><input id="kpl" value={dg.soPhuLuc} onChange={(e) => setDg({ ...dg, soPhuLuc: e.target.value })} /></div>
              </div>
              {dg.loi === 'ncc' && (
                <div className="hang">
                  <div><label htmlFor="klmc">Chuyển trách nhiệm cho lô mua</label><select id="klmc" value={dg.loMuaChuyenId} onChange={(e) => setDg({ ...dg, loMuaChuyenId: e.target.value })}><option value="">Không chuyển</option>{d.loMua.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.supplierName}</option>)}</select></div>
                  <div><label htmlFor="kstc">Số tiền nhà cung cấp chịu</label><input id="kstc" inputMode="decimal" value={dg.soTienChuyenNcc} onChange={(e) => setDg({ ...dg, soTienChuyenNcc: e.target.value })} /></div>
                </div>
              )}
              <label htmlFor="kkl">Kết luận</label>
              <textarea id="kkl" rows={2} required value={dg.ketLuan} onChange={(e) => setDg({ ...dg, ketLuan: e.target.value })} />
              <div className="hang" style={{ marginTop: 8 }}><button>Đóng khiếu nại</button><button type="button" className="phu-btn" onClick={() => setDg(null)}>Thôi</button></div>
            </form>
          )}
        </div>
      ))}
      {d.quyen.mo && (
        <details style={{ marginTop: 8 }}>
          <summary>Mở khiếu nại (thay mặt người mua)</summary>
          <form className="o" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); lam(() => api(`/lo-xuat/${loId}/khieu-nai`, { body: { loai: m.loai, moTa: m.moTa, soTienYeuCau: m.soTienYeuCau ? so(m.soTienYeuCau) : null, bangChung: m.bangChung || null } }), 'Đã mở khiếu nại.', () => { setM({ loai: 'chat_luong', moTa: '', soTienYeuCau: '', bangChung: '' }); onDoi?.(); }); }}>
            <div className="hang">
              <div><label htmlFor="mkl">Loại</label><select id="mkl" value={m.loai} onChange={(e) => setM({ ...m, loai: e.target.value })}>{Object.entries(LOAI_KN).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
              <div><label htmlFor="mst">Người mua yêu cầu ({d.tienTe})</label><input id="mst" inputMode="decimal" value={m.soTienYeuCau} onChange={(e) => setM({ ...m, soTienYeuCau: e.target.value })} /></div>
            </div>
            <label htmlFor="mmt">Nội dung</label>
            <textarea id="mmt" rows={2} required minLength={5} value={m.moTa} onChange={(e) => setM({ ...m, moTa: e.target.value })} />
            <label htmlFor="mbc">Bằng chứng (số biên bản, chứng thư giám định cảng đến…)</label>
            <input id="mbc" value={m.bangChung} onChange={(e) => setM({ ...m, bangChung: e.target.value })} />
            <button style={{ marginTop: 12 }}>Mở khiếu nại</button>
          </form>
        </details>
      )}
    </div>
  );
}

// ---------- Quyết toán ----------

interface DieuKien { ma: string; ten: string; dat: boolean; chiTiet: string }
interface Dong { ma: string; ten: string; soTienUsd: number }
interface Ban {
  id: string;
  status: string;
  trangThai: string;
  marginUsd: number;
  marginPct: number | null;
  estimateMarginPct: number | null;
  estimateSource: string | null;
  needsDirector: boolean;
  directorReason: string | null;
  contentHash: string;
  data: { dong: Dong[] };
  preparedByName: string;
  preparedAt: string;
  kttName: string | null;
  chiefAccountantAt: string | null;
  gdName: string | null;
  directorAt: string | null;
  returnedByName: string | null;
  returnReason: string | null;
  quyen: { duyet: boolean; traLai: boolean };
}
interface QuyetToan {
  dieuKien: DieuKien[];
  duThao: { dong: Dong[]; bienUsd: number; bienPhanTram: number | null };
  duToan: { phanTram: number; nguon: string } | null;
  banQuyetToan: Ban[];
  quyen: { lap: boolean; canNhapDuToan: boolean };
}

function BangDong({ dong, bien, pct }: { dong: Dong[]; bien: number; pct: number | null }) {
  return (
    <div className="bang-cuon">
      <table>
        <tbody>
          {dong.map((l) => <tr key={l.ma}><td>{l.ten}</td><td style={{ textAlign: 'right' }}>{usd(l.soTienUsd)}</td></tr>)}
          <tr><td><strong>Biên của lô</strong></td><td style={{ textAlign: 'right' }} className={bien < 0 ? 'kyc-canh-bao' : ''}><strong>{usd(bien)}</strong>{pct !== null && ` (${pct}%)`}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

export function QuyetToanLo({ loId, version }: { loId: string; version?: number }) {
  const { d, loi, tb, lam, tai } = useTai<QuyetToan>(`/lo-xuat/${loId}/quyet-toan`);
  const [duToan, setDuToan] = useState('');
  useEffect(() => {
    if (version) tai().catch(() => undefined);
  }, [version, tai]);
  if (!d) return loi ? <div className="loi">{loi}</div> : null;
  const active = d.banQuyetToan.find((b) => b.status !== 'tra_lai');

  return (
    <div>
      <ThongBao loi={loi} tb={tb} />
      {!active && (
        <>
          <ul style={{ margin: '8px 0' }}>
            {d.dieuKien.map((c) => <li key={c.ma}><span className={c.dat ? 'kyc-dat' : 'kyc-canh-bao'}>{c.dat ? '✓' : '✗'} {c.ten}</span> <span className="phu">{c.chiTiet}</span></li>)}
          </ul>
          <strong>Dự thảo theo số liệu hiện tại</strong>
          <BangDong dong={d.duThao.dong} bien={d.duThao.bienUsd} pct={d.duThao.bienPhanTram} />
          <p className="phu">{d.duToan ? `Biên dự toán ${d.duToan.phanTram}% theo ${d.duToan.nguon}.` : 'Không có báo giá làm dự toán: kế toán ghi biên dự toán theo phương án kinh doanh khi lập.'} Giám đốc duyệt thêm khi lô lỗ hoặc biên thấp hơn dự toán quá 10%.</p>
          {d.quyen.lap && (
            <form className="hang" onSubmit={(e) => { e.preventDefault(); lam(() => api(`/lo-xuat/${loId}/quyet-toan`, { body: { bienDuToanPhanTram: duToan ? so(duToan) : null } }), 'Đã lập quyết toán, chờ Kế toán trưởng duyệt. Số liệu tiền của lô đã khoá.'); }}>
              {d.quyen.canNhapDuToan && <div><label htmlFor="qtdt">Biên dự toán (%)</label><input id="qtdt" inputMode="decimal" required value={duToan} onChange={(e) => setDuToan(e.target.value)} /></div>}
              <button>Lập quyết toán</button>
            </form>
          )}
        </>
      )}
      {d.banQuyetToan.map((b) => (
        <div key={b.id} className="o" style={{ marginTop: 8 }}>
          <strong>Bản quyết toán</strong> <span className="nhan">{b.trangThai}</span>
          {b.status !== 'tra_lai' && <BangDong dong={b.data.dong} bien={b.marginUsd} pct={b.marginPct} />}
          <div className="phu">
            Lập: {b.preparedByName}, {ngayGio(b.preparedAt)} · dự toán {b.estimateMarginPct ?? '—'}% ({b.estimateSource === 'bao_gia' ? 'theo báo giá' : 'nhập tay'})
            {b.kttName && <> · Kế toán trưởng {b.kttName} duyệt {ngayGio(b.chiefAccountantAt)}</>}
            {b.gdName && <> · Giám đốc {b.gdName} duyệt {ngayGio(b.directorAt)}</>}
          </div>
          {b.needsDirector && <div className="kyc-canh-bao" style={{ fontWeight: 500 }}>Cần Giám đốc duyệt thêm: {b.directorReason}</div>}
          {b.returnedByName && <div className="phu">Trả lại bởi {b.returnedByName}: {b.returnReason}</div>}
          {b.status === 'da_duyet' && <div className="phu">Mã băm ghi vào sổ cái hợp đồng đối ứng: <code>{b.contentHash.slice(0, 16)}…</code></div>}
          <div className="hang" style={{ gap: 6, marginTop: 6 }}>
            {b.quyen.duyet && <button className="nho" onClick={() => lam(() => api(`/quyet-toan/${b.id}/duyet`, { method: 'POST' }), 'Đã duyệt.')}>Duyệt</button>}
            {b.quyen.traLai && <button className="phu-btn nho" onClick={() => { const l = window.prompt('Lý do trả lại'); if (l) lam(() => api(`/quyet-toan/${b.id}/tra-lai`, { body: { lyDo: l } }), 'Đã trả lại; kế toán sửa số liệu rồi lập lại.'); }}>Trả lại</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Cổng nhà cung cấp ----------

interface KhoanCong { id: string; lotCode: string; purchaseLotCode: string | null; milestone: string; dueDate: string | null; plannedAmount: number; currency: string; status: string; paidAmount: number | null; paidOn: string | null; reference: string | null; coTheXacNhan: boolean }

/** Cổng nhà cung cấp (môi giới): xác nhận đã nhận tiền hàng người mua trả thẳng. */
export function XacNhanTienHang() {
  const { d, loi, tb, lam } = useTai<{ khoan: KhoanCong[] }>('/cong/thanh-toan');
  const [f, setF] = useState<{ id: string; soTien: string; ngay: string; tyGia: string; soThamChieu: string } | null>(null);
  if (!d || d.khoan.length === 0) return null;
  return (
    <div style={{ marginTop: 24 }}>
      <h2>Tiền hàng người mua trả quý công ty</h2>
      <p className="phu">Với lô môi giới, người mua trả thẳng cho quý công ty. Khi nhận được tiền, xin xác nhận tại đây để Vạn Thuận theo dõi và quyết toán phí.</p>
      <ThongBao loi={loi} tb={tb} />
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Lô</th><th>Mốc</th><th>Số tiền</th><th>Đã nhận</th><th></th></tr></thead>
          <tbody>
            {d.khoan.map((k) => (
              <tr key={k.id}>
                <td>{k.lotCode}{k.purchaseLotCode && <div className="phu">lô mua {k.purchaseLotCode}</div>}</td>
                <td>{MOC[k.milestone]}{k.dueDate && <div className="phu">{ngay(k.dueDate)}</div>}</td>
                <td>{tien(k.plannedAmount, k.currency)}</td>
                <td>{k.status === 'da_thuc_hien' ? <>{tien(k.paidAmount, k.currency)} <span className="phu">ngày {ngay(k.paidOn)}{k.reference ? ` · ${k.reference}` : ''}</span></> : <span className="phu">Chưa xác nhận</span>}</td>
                <td>{k.coTheXacNhan && <button className="nho" onClick={() => setF({ id: k.id, soTien: String(k.plannedAmount), ngay: '', tyGia: '', soThamChieu: '' })}>Xác nhận đã nhận</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {f && (
        <form className="o" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); lam(() => api(`/cong/thanh-toan/${f.id}/da-nhan`, { body: { soTien: so(f.soTien), ngay: f.ngay, tyGia: f.tyGia ? so(f.tyGia) : null, soThamChieu: f.soThamChieu || null } }), 'Đã xác nhận. Cảm ơn quý công ty.', () => setF(null)); }}>
          <div className="hang">
            <div><label htmlFor="cst">Số tiền đã nhận</label><input id="cst" inputMode="decimal" required value={f.soTien} onChange={(e) => setF({ ...f, soTien: e.target.value })} /></div>
            <div><label htmlFor="cng">Ngày nhận</label><input id="cng" type="date" required value={f.ngay} onChange={(e) => setF({ ...f, ngay: e.target.value })} /></div>
            <div><label htmlFor="ctg">Tỷ giá (nếu không phải USD)</label><input id="ctg" inputMode="decimal" value={f.tyGia} onChange={(e) => setF({ ...f, tyGia: e.target.value })} /></div>
            <div><label htmlFor="csc">Số chứng từ ngân hàng</label><input id="csc" value={f.soThamChieu} onChange={(e) => setF({ ...f, soThamChieu: e.target.value })} /></div>
            <button>Xác nhận</button>
          </div>
        </form>
      )}
    </div>
  );
}
