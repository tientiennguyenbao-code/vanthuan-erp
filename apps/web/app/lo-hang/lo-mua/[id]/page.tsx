'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { kg, LOAI_GIAO_DICH, NhatKy, SuKienLo, TRANG_THAI_LO_MUA, TRANG_THAI_LO_XUAT } from '@/lib/lo-hang';
import { ngay } from '@/lib/nhan';
import { NhanEudr, PhieuThuGomLo } from '@/lib/thu-gom';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../../khung-trang';

interface LoMua {
  id: string;
  code: string;
  dealType: string;
  status: string;
  supplierName: string;
  commodityName: string;
  contractId: string;
  contractCode: string;
  ownerName: string;
  growingAreaCode: string | null;
  packingFacilityCode: string | null;
  harvestDate: string | null;
  certifications: string | null;
  eudrClass: string | null;
  facilityName: string | null;
  collectedKg: number;
  lossKg: number;
  availableKg: number;
  allocatedKg: number;
  unallocatedKg: number;
  cancelReason: string | null;
  phanBo: { id: string; exportLotId: string; exportCode: string; exportStatus: string; buyerName: string; quantityKg: number; approvedAt: string | null; cancelledAt: string | null; cancelReason: string | null }[];
  chiaLo: { biChia: boolean; daXacNhan: boolean; lanGanNhat: { vanBan: string; maBam: string; luc: string } | null };
  suKien: SuKienLo[];
  quyen: { capNhat: boolean; dongYChiaLo: boolean; huy: boolean };
}

export default function ChiTietLoMua() {
  const toi = useToi();
  const { id } = useParams<{ id: string }>();
  const [lo, setLo] = useState<LoMua | null>(null);
  const [kho, setKho] = useState<{ id: string; name: string; kind: string; active: boolean }[]>([]);
  const [loi, setLoi] = useState('');
  const [thongBao, setThongBao] = useState('');
  const [f, setF] = useState({ khoiLuongKg: '', haoHutKg: '', coSoId: '', ghiChu: '' });
  const [vanBan, setVanBan] = useState('');
  const [lyDo, setLyDo] = useState('');

  const tai = useCallback(async () => {
    setLo(await api<LoMua>(`/lo-mua/${id}`));
  }, [id]);

  useEffect(() => {
    if (!toi) return;
    tai().catch((e: Error) => setLoi(e.message));
    api<{ coSo: { id: string; name: string; kind: string; active: boolean }[] }>('/danh-muc/co-so').then((r) => setKho(r.coSo.filter((c) => c.active))).catch(() => undefined);
  }, [toi, tai]);

  async function lam(fn: () => Promise<unknown>, xong: string) {
    setLoi('');
    setThongBao('');
    try {
      await fn();
      setF({ khoiLuongKg: '', haoHutKg: '', coSoId: '', ghiChu: '' });
      setVanBan('');
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
  const buoc = lo.status === 'thu_gom' ? 'thu_gom' : lo.status === 'da_so_che' ? 'nhap_kho' : null;
  function guiSuKien(e: FormEvent, loai: 'thu_gom' | 'so_che' | 'nhap_kho') {
    e.preventDefault();
    const body: Record<string, unknown> = { loai, khoiLuongKg: so(f.khoiLuongKg), ghiChu: f.ghiChu || null };
    if (loai === 'so_che') body.haoHutKg = f.haoHutKg ? so(f.haoHutKg) : null;
    if (f.coSoId) body.coSoId = f.coSoId;
    lam(() => api(`/lo-mua/${id}/su-kien`, { body }), loai === 'thu_gom' ? 'Đã ghi thu gom.' : loai === 'so_che' ? 'Đã ghi sơ chế và hao hụt.' : 'Đã ghi nhập kho.');
  }

  return (
    <KhungTrang toi={toi}>
      <p><Link href="/lo-hang/lo-mua">← Lô mua</Link></p>
      <h1>{lo.code} <span style={{ fontSize: 16 }}>{TRANG_THAI_LO_MUA[lo.status]}</span> {lo.eudrClass && <NhanEudr eudrClass={lo.eudrClass} />}</h1>
      <p className="phu">{LOAI_GIAO_DICH[lo.dealType]} · hợp đồng <Link href={`/hop-dong/${lo.contractId}`}>{lo.contractCode}</Link> · phụ trách: {lo.ownerName}</p>
      {lo.status === 'da_huy' && <div className="loi">Đã huỷ: {lo.cancelReason}</div>}
      {thongBao && <div className="dat" role="status">{thongBao}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}

      <div className="luoi" style={{ marginTop: 16 }}>
        <div className="o">
          <strong>Nguồn hàng</strong>
          <div>{lo.supplierName}</div>
          <div>{lo.commodityName}</div>
          <div className="phu">Vùng trồng: {lo.growingAreaCode ?? '—'} · cơ sở đóng gói: {lo.packingFacilityCode ?? '—'}</div>
          <div className="phu">Thu hoạch: {ngay(lo.harvestDate)}{lo.certifications && ` · ${lo.certifications}`}</div>
        </div>
        <div className="o">
          <strong>Khối lượng</strong>
          <div>Thu gom: {kg(lo.collectedKg)}</div>
          <div>Hao hụt sơ chế: {lo.status === 'thu_gom' ? '—' : kg(lo.lossKg)}</div>
          <div>Còn lại: <strong>{lo.status === 'thu_gom' ? '—' : kg(lo.availableKg)}</strong>{lo.facilityName && <span className="phu"> tại {lo.facilityName}</span>}</div>
          <div className="phu">Đã phân bổ {kg(lo.allocatedKg)} · chưa phân bổ {lo.status === 'thu_gom' ? '—' : kg(lo.unallocatedKg)}</div>
        </div>
        <div className="o">
          <strong>Chia cho nhiều người mua</strong>
          {!lo.chiaLo.biChia ? (
            <div className="phu">Lô chưa bị chia cho từ hai lô xuất trở lên.</div>
          ) : lo.chiaLo.daXacNhan ? (
            <div className="kyc-dat">Nhà cung cấp đã đồng ý ({lo.chiaLo.lanGanNhat?.vanBan}). Mã băm đã ghi vào sổ cái hợp đồng.</div>
          ) : (
            <div className="kyc-canh-bao">Cần xác nhận đồng ý của nhà cung cấp trước khi các lô xuất sang giám định.</div>
          )}
        </div>
      </div>

      {lo.status !== 'da_huy' && <PhieuThuGomLo duong={`/lo-mua/${id}/phieu-thu-gom`} duongHuy={(p) => `/phieu-thu-gom/${p}/huy`} onDoi={() => tai().catch(() => undefined)} />}

      {lo.quyen.capNhat && buoc && (
        <>
          <h2>Ghi sự kiện</h2>
          {lo.status === 'thu_gom' && (
            <div className="luoi">
              {lo.eudrClass !== 'du' && (
              <form className="o" onSubmit={(e) => guiSuKien(e, 'thu_gom')}>
                <strong>Ghi tay (không theo hộ, thửa)</strong>
                <p className="phu">Với cà phê, hàng ghi tay là hàng không đủ EUDR và cả lô không đi EU được. Nên ghi bằng phiếu thu gom ở trên.</p>
                <label htmlFor="tg-kl">Khối lượng (kg)</label>
                <input id="tg-kl" inputMode="decimal" required value={f.khoiLuongKg} onChange={(e) => setF({ ...f, khoiLuongKg: e.target.value })} />
                <label htmlFor="tg-gc">Ghi chú</label>
                <input id="tg-gc" value={f.ghiChu} onChange={(e) => setF({ ...f, ghiChu: e.target.value })} placeholder="VD: Phiếu nhập số 15" />
                <button style={{ marginTop: 12 }}>Ghi thu gom</button>
              </form>
              )}
              {lo.collectedKg > 0 && (
                <form className="o" onSubmit={(e) => guiSuKien(e, 'so_che')}>
                  <strong>Sơ chế xong</strong>
                  <label htmlFor="sc-kl">Khối lượng sau sơ chế (kg)</label>
                  <input id="sc-kl" inputMode="decimal" required value={f.khoiLuongKg} onChange={(e) => setF({ ...f, khoiLuongKg: e.target.value, haoHutKg: e.target.value ? String(Math.round((lo.collectedKg - so(e.target.value)) * 100) / 100) : '' })} />
                  <label htmlFor="sc-hh">Hao hụt (kg)</label>
                  <input id="sc-hh" inputMode="decimal" value={f.haoHutKg} onChange={(e) => setF({ ...f, haoHutKg: e.target.value })} />
                  <label htmlFor="sc-cs">Xưởng sơ chế</label>
                  <select id="sc-cs" value={f.coSoId} onChange={(e) => setF({ ...f, coSoId: e.target.value })}>
                    <option value="">Không ghi</option>
                    {kho.filter((k) => k.kind === 'xuong_so_che').map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                  <button style={{ marginTop: 12 }}>Ghi sơ chế</button>
                </form>
              )}
            </div>
          )}
          {lo.status === 'da_so_che' && (
            <form className="o" onSubmit={(e) => guiSuKien(e, 'nhap_kho')} style={{ maxWidth: 520 }}>
              <strong>Nhập kho</strong>
              <label htmlFor="nk-kho">Kho</label>
              <select id="nk-kho" required value={f.coSoId} onChange={(e) => setF({ ...f, coSoId: e.target.value })}>
                <option value="">Chọn kho</option>
                {kho.filter((k) => k.kind === 'kho').map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
              <label htmlFor="nk-kl">Số lượng nhập (kg), phải khớp {kg(lo.availableKg)}</label>
              <input id="nk-kl" inputMode="decimal" required value={f.khoiLuongKg} onChange={(e) => setF({ ...f, khoiLuongKg: e.target.value })} />
              <label htmlFor="nk-gc">Số biên nhận kho</label>
              <input id="nk-gc" value={f.ghiChu} onChange={(e) => setF({ ...f, ghiChu: e.target.value })} />
              <button style={{ marginTop: 12 }}>Ghi nhập kho</button>
            </form>
          )}
        </>
      )}

      <h2>Phân bổ sang lô xuất</h2>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Lô xuất</th><th>Người mua</th><th>Khối lượng</th><th>Tình trạng</th></tr></thead>
          <tbody>
            {lo.phanBo.length === 0 && <tr><td colSpan={4} className="phu">Chưa phân bổ. Phân bổ làm ở trang lô xuất khi đóng gói.</td></tr>}
            {lo.phanBo.map((p) => (
              <tr key={p.id} className={p.cancelledAt ? 'huy' : ''}>
                <td><Link href={`/lo-hang/${p.exportLotId}`}>{p.exportCode}</Link><div className="phu">{TRANG_THAI_LO_XUAT[p.exportStatus]}</div></td>
                <td>{p.buyerName}</td>
                <td>{kg(p.quantityKg)}</td>
                <td>{p.cancelledAt ? `Đã huỷ: ${p.cancelReason}` : p.approvedAt ? 'Đã duyệt' : 'Chờ Trưởng phòng duyệt'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lo.quyen.dongYChiaLo && (
        <form className="o" style={{ marginTop: 12, maxWidth: 620 }} onSubmit={(e) => { e.preventDefault(); lam(() => api(`/lo-mua/${id}/dong-y-chia-lo`, { body: { soVanBan: vanBan } }), 'Đã ghi xác nhận đồng ý chia lô vào sổ cái hợp đồng.'); }}>
          <strong>Ghi xác nhận đồng ý chia lô của nhà cung cấp</strong>
          <p className="phu">Xác nhận áp cho đúng cách chia đang có ở bảng trên. Nếu sau này chia lại, phải xin xác nhận mới.</p>
          <label htmlFor="vb">Số hoặc tên văn bản đồng ý</label>
          <input id="vb" required minLength={3} value={vanBan} onChange={(e) => setVanBan(e.target.value)} placeholder="VD: Công văn 12/2026/CV-HTX ngày 20/12/2026" />
          <button style={{ marginTop: 12 }}>Ghi xác nhận</button>
        </form>
      )}

      {lo.quyen.huy && (
        <details style={{ marginTop: 16 }}>
          <summary>Huỷ lô mua</summary>
          <form className="o" style={{ marginTop: 8, maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); lam(() => api(`/lo-mua/${id}/huy`, { body: { lyDo } }), 'Đã huỷ lô.'); }}>
            <label htmlFor="ld">Lý do huỷ</label>
            <input id="ld" required minLength={3} value={lyDo} onChange={(e) => setLyDo(e.target.value)} />
            <button className="phu-btn" style={{ marginTop: 12 }}>Xác nhận huỷ</button>
          </form>
        </details>
      )}

      <h2>Nhật ký lô</h2>
      <NhatKy suKien={lo.suKien} />
    </KhungTrang>
  );
}
