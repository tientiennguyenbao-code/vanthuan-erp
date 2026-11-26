'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { kg } from './lo-hang';
import { ngay, ngayGio } from './nhan';
import { ha, TRANG_THAI_RUNG } from './nguon-cung';

export interface PhieuThuGom {
  id: string; code: string; farmerName: string; farmerCode: string; plotCode: string; harvestDate: string; quantityKg: number;
  moisturePct: number | null; weighTicketNo: string | null; eudrOk: boolean | null; eudrReasons: string[]; capKg: number | null; luuY: string[];
  source: string; note: string | null; createdByName: string; createdAt: string; voidedAt: string | null; voidReason: string | null;
}
export interface ThuaChon {
  id: string; code: string; farmerId: string; areaCode: string; areaHa: number; crop: string | null;
  capKg: number | null; usedKg: number; conLaiKg: number | null; coCanhBao: boolean; forestStatus: string;
}
export interface DuLieuThuGom {
  lo: { id: string; code: string; status: string; collectedKg: number; eudrClass: string | null; sector: string; commodityName: string; apDungEudr: boolean };
  duocGhi: boolean;
  phieu: PhieuThuGom[];
  ho: { id: string; code: string; fullName: string }[];
  thua: ThuaChon[];
}

/** Nhãn EUDR của lô mua cà phê. */
export function NhanEudr({ eudrClass, apDung = true }: { eudrClass: string | null; apDung?: boolean }) {
  if (!apDung) return null;
  if (eudrClass === 'du') return <span className="nhan nhan-eudr">Đủ EUDR</span>;
  if (eudrClass === 'khong_du') return <span className="nhan nhan-khong-eudr">Không đủ EUDR, không đi EU</span>;
  return <span className="nhan">Chưa định loại EUDR</span>;
}

const homNay = () => new Date().toISOString().slice(0, 10);
const so = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));

/**
 * Phiếu thu gom của một lô mua: bảng phiếu và mẫu ghi phiếu mới (chọn hộ, rồi thửa của hộ).
 * Dùng chung cho trang nhân viên và cổng nhà cung cấp; chỉ khác đường gọi máy chủ.
 */
export function PhieuThuGomLo({ duong, duongHuy, onDoi }: { duong: string; duongHuy: (id: string) => string; onDoi?: () => void }) {
  const [d, setD] = useState<DuLieuThuGom | null>(null);
  const [loi, setLoi] = useState('');
  const [tb, setTb] = useState('');
  const [f, setF] = useState({ farmerId: '', plotId: '', harvestDate: homNay(), quantityKg: '', moisturePct: '', weighTicketNo: '', note: '' });
  const [huy, setHuy] = useState<{ id: string; lyDo: string } | null>(null);

  const tai = useCallback(() => api<DuLieuThuGom>(duong).then(setD), [duong]);
  useEffect(() => {
    tai().catch((e: Error) => setLoi(e.message));
  }, [tai]);

  async function lam(fn: () => Promise<string>) {
    setLoi('');
    setTb('');
    try {
      const xong = await fn();
      await tai();
      onDoi?.();
      setTb(xong);
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  function gui(e: FormEvent) {
    e.preventDefault();
    lam(async () => {
      const r = await api<{ code: string; eudrOk: boolean | null; eudrReasons: string[]; luuY: string[] }>(duong, {
        body: {
          farmerId: f.farmerId,
          plotId: f.plotId,
          harvestDate: f.harvestDate,
          quantityKg: so(f.quantityKg),
          moisturePct: f.moisturePct ? so(f.moisturePct) : null,
          weighTicketNo: f.weighTicketNo.trim() || null,
          note: f.note.trim() || null,
        },
      });
      setF({ ...f, plotId: '', quantityKg: '', moisturePct: '', weighTicketNo: '', note: '' });
      if (r.eudrOk === false) return `Đã ghi phiếu ${r.code}. Hàng chưa đủ EUDR: ${r.eudrReasons.join('; ')}.`;
      if (r.luuY.length) return `Đã ghi phiếu ${r.code}. Lưu ý: ${r.luuY.join('; ')}.`;
      return `Đã ghi phiếu ${r.code}.`;
    });
  }

  if (!d) return loi ? <div className="loi">{loi}</div> : <p className="phu">Đang tải phiếu thu gom…</p>;
  const thuaCuaHo = d.thua.filter((t) => t.farmerId === f.farmerId);
  const thuaChon = d.thua.find((t) => t.id === f.plotId);
  const conHieuLuc = d.phieu.filter((p) => !p.voidedAt);

  return (
    <section>
      <h2>Phiếu thu gom theo hộ và thửa</h2>
      <p className="phu">
        {d.lo.apDungEudr ? (
          <>Nhãn lô: <NhanEudr eudrClass={d.lo.eudrClass} />. Phiếu đầu tiên định nhãn cho cả lô; hàng đủ và chưa đủ EUDR không ghi chung một lô.</>
        ) : (
          'Mỗi phiếu ghi hàng của một hộ từ một thửa, để truy được nguồn gốc.'
        )}{' '}
        {conHieuLuc.length} phiếu, cộng {kg(conHieuLuc.reduce((s, p) => s + p.quantityKg, 0))}.
      </p>
      {tb && <div className="dat" role="status">{tb}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}

      {d.duocGhi && (
        <form className="o" onSubmit={gui} style={{ maxWidth: 640, marginBottom: 12 }}>
          <strong>Ghi phiếu mới</strong>
          {d.ho.length === 0 ? (
            <p className="phu">Nhà cung cấp chưa có nông hộ nào. Thêm hộ và thửa ở hồ sơ vùng trồng trước.</p>
          ) : (
            <div className="luoi">
              <div>
                <label htmlFor="pg-ho">Hộ</label>
                <select id="pg-ho" required value={f.farmerId} onChange={(e) => setF({ ...f, farmerId: e.target.value, plotId: '' })}>
                  <option value="">Chọn hộ</option>
                  {d.ho.map((h) => <option key={h.id} value={h.id}>{h.code} · {h.fullName}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="pg-thua">Thửa</label>
                <select id="pg-thua" required value={f.plotId} onChange={(e) => setF({ ...f, plotId: e.target.value })} disabled={!f.farmerId}>
                  <option value="">{f.farmerId && thuaCuaHo.length === 0 ? 'Hộ chưa có thửa của ngành này' : 'Chọn thửa'}</option>
                  {thuaCuaHo.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {ha(t.areaHa)}{t.conLaiKg !== null ? ` · còn ${kg(t.conLaiKg)}` : ''}{t.coCanhBao ? ' · có cảnh báo' : ''}{d.lo.apDungEudr && t.forestStatus !== 'khong_rung' ? ' · chưa đạt kiểm tra rừng' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="pg-ngay">Ngày thu hoạch</label>
                <input id="pg-ngay" type="date" required max={homNay()} value={f.harvestDate} onChange={(e) => setF({ ...f, harvestDate: e.target.value })} />
              </div>
              <div>
                <label htmlFor="pg-kl">Khối lượng cân (kg)</label>
                <input id="pg-kl" inputMode="decimal" required value={f.quantityKg} onChange={(e) => setF({ ...f, quantityKg: e.target.value })} />
              </div>
              <div>
                <label htmlFor="pg-am">Độ ẩm (%)</label>
                <input id="pg-am" inputMode="decimal" value={f.moisturePct} onChange={(e) => setF({ ...f, moisturePct: e.target.value })} />
              </div>
              <div>
                <label htmlFor="pg-so">Số phiếu cân</label>
                <input id="pg-so" value={f.weighTicketNo} onChange={(e) => setF({ ...f, weighTicketNo: e.target.value })} />
              </div>
            </div>
          )}
          {thuaChon && (
            <p className={thuaChon.capKg === null || thuaChon.coCanhBao || (d.lo.apDungEudr && thuaChon.forestStatus !== 'khong_rung') ? 'canh-bao-nhe' : 'phu'} style={{ marginTop: 8 }}>
              {thuaChon.capKg === null
                ? 'Vùng này chưa có mức năng suất tối đa, nên hàng chưa được tính là đủ EUDR. Nhờ Ban Giám đốc đặt mức ở trang Năng suất tối đa.'
                : `Trần 12 tháng của thửa: ${kg(thuaChon.capKg)}, đã thu ${kg(thuaChon.usedKg)}, còn ${kg(thuaChon.conLaiKg)}.`}
              {thuaChon.coCanhBao && ' Thửa còn cảnh báo (chồng lấn hoặc diện tích lệch), hàng chưa đủ EUDR cho đến khi đo lại.'}
              {d.lo.apDungEudr && thuaChon.forestStatus !== 'khong_rung' && ` Thửa chưa có kết quả kiểm tra rừng "không rừng" đã duyệt (hiện: ${TRANG_THAI_RUNG[thuaChon.forestStatus]}), nên hàng chưa đủ EUDR.`}
            </p>
          )}
          {d.ho.length > 0 && <button style={{ marginTop: 12 }}>Ghi phiếu</button>}
        </form>
      )}

      <div className="bang-cuon">
        <table>
          <thead><tr><th>Phiếu</th><th>Hộ</th><th>Thửa</th><th>Thu hoạch</th><th>Khối lượng</th>{d.lo.apDungEudr && <th>EUDR</th>}<th>Người ghi</th><th></th></tr></thead>
          <tbody>
            {d.phieu.length === 0 && <tr><td colSpan={8} className="phu">Chưa có phiếu nào.</td></tr>}
            {d.phieu.map((p) => (
              <tr key={p.id} className={p.voidedAt ? 'huy' : ''}>
                <td>{p.code}{p.weighTicketNo && <div className="phu">Phiếu cân {p.weighTicketNo}</div>}</td>
                <td>{p.farmerName}<div className="phu">{p.farmerCode}</div></td>
                <td>{p.plotCode}</td>
                <td>{ngay(p.harvestDate)}</td>
                <td>{kg(p.quantityKg)}{p.moisturePct !== null && <div className="phu">ẩm {p.moisturePct}%</div>}{p.luuY.map((x) => <div key={x} className="canh-bao-nhe">{x}</div>)}</td>
                {d.lo.apDungEudr && (
                  <td>{p.eudrOk ? <span className="kyc-dat">Đủ</span> : <span className="canh-bao-nhe" title={p.eudrReasons.join('; ')}>Chưa đủ</span>}
                    {!p.eudrOk && <div className="phu">{p.eudrReasons.join('; ')}</div>}</td>
                )}
                <td>{p.createdByName}<div className="phu">{p.source === 'cong_ncc' ? 'Nhà cung cấp ghi' : 'Nhân viên ghi'} · {ngayGio(p.createdAt)}</div></td>
                <td>
                  {p.voidedAt ? (
                    <span className="phu">Đã huỷ: {p.voidReason}</span>
                  ) : d.duocGhi && huy?.id !== p.id ? (
                    <button type="button" className="phu-btn" onClick={() => setHuy({ id: p.id, lyDo: '' })}>Huỷ</button>
                  ) : null}
                  {huy?.id === p.id && (
                    <form onSubmit={(e) => { e.preventDefault(); lam(async () => { await api(duongHuy(p.id), { body: { lyDo: huy.lyDo } }); setHuy(null); return `Đã huỷ phiếu ${p.code}.`; }); }}>
                      <input aria-label="Lý do huỷ" required minLength={3} placeholder="Lý do huỷ" value={huy.lyDo} onChange={(e) => setHuy({ ...huy, lyDo: e.target.value })} />
                      <button className="phu-btn">Xác nhận</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
