'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BEN_LAM, GIAI_DOAN, NGANH, PHAM_VI, YEU_CAU } from '@/lib/chung-tu';
import { LOAI_GIAO_DICH, THI_TRUONG } from '@/lib/lo-hang';
import { ngay } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface QuyTac {
  id: string;
  code: string;
  name: string;
  sector: string | null;
  market: string | null;
  incoterms: string[] | null;
  dealType: string | null;
  requirement: string;
  stage: string;
  scope: string;
  party: string;
  issuer: string | null;
  legalBasis: string | null;
  uncertain: boolean;
  note: string | null;
  active: boolean;
  reviewedAt: string;
  updatedByName: string | null;
  quaHanRaSoat: boolean;
}

const trong = {
  ma: '',
  ten: '',
  nganh: '',
  thiTruong: '',
  incoterms: '',
  loaiGiaoDich: '',
  yeuCau: 'bb',
  giaiDoan: 'truoc_xep_tau',
  phamVi: 'lo',
  benLam: 'van_thuan',
  noiCap: '',
  canCu: '',
  chuaChac: false,
  ghiChu: '',
  hieuLuc: true,
};

const chon = (id: string, nhan: string, v: string, doi: (v: string) => void, ds: Record<string, string>, tatCa?: string) => (
  <div>
    <label htmlFor={id}>{nhan}</label>
    <select id={id} value={v} onChange={(e) => doi(e.target.value)}>
      {tatCa !== undefined && <option value="">{tatCa}</option>}
      {Object.entries(ds).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
    </select>
  </div>
);

export default function QuyTacChungTu() {
  const toi = useToi();
  const [ds, setDs] = useState<QuyTac[]>([]);
  const [thiTruong, setThiTruong] = useState('');
  const [nganh, setNganh] = useState('');
  const [loi, setLoi] = useState('');
  const [thongBao, setThongBao] = useState('');
  const [sua, setSua] = useState<string | null>(null);
  const [f, setF] = useState(trong);
  const coTheSua = !!toi?.quyen.includes('MA_TRAN_DUYET');

  const tai = useCallback(async () => {
    const p = new URLSearchParams();
    if (thiTruong) p.set('thiTruong', thiTruong);
    if (nganh) p.set('nganh', nganh);
    setDs((await api<{ quyTac: QuyTac[] }>(`/quy-tac-chung-tu?${p.toString()}`)).quyTac);
  }, [thiTruong, nganh]);

  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  async function lam(fn: () => Promise<unknown>, xong: string) {
    setLoi('');
    setThongBao('');
    try {
      await fn();
      await tai();
      setThongBao(xong);
      return true;
    } catch (e) {
      setLoi((e as Error).message);
      return false;
    }
  }

  function moSua(q: QuyTac | null) {
    setSua(q ? q.id : 'moi');
    setF(
      q
        ? {
            ma: q.code,
            ten: q.name,
            nganh: q.sector ?? '',
            thiTruong: q.market ?? '',
            incoterms: (q.incoterms ?? []).join(', '),
            loaiGiaoDich: q.dealType ?? '',
            yeuCau: q.requirement,
            giaiDoan: q.stage,
            phamVi: q.scope,
            benLam: q.party,
            noiCap: q.issuer ?? '',
            canCu: q.legalBasis ?? '',
            chuaChac: q.uncertain,
            ghiChu: q.note ?? '',
            hieuLuc: q.active,
          }
        : trong,
    );
  }

  async function luu(e: FormEvent) {
    e.preventDefault();
    const body = {
      ...f,
      nganh: f.nganh || null,
      thiTruong: f.thiTruong || null,
      loaiGiaoDich: f.loaiGiaoDich || null,
      incoterms: f.incoterms ? f.incoterms.split(/[\s,;]+/).filter(Boolean).map((x) => x.toUpperCase()) : null,
      noiCap: f.noiCap || null,
      canCu: f.canCu || null,
      ghiChu: f.ghiChu || null,
    };
    const ok = await lam(() => (sua === 'moi' ? api('/quy-tac-chung-tu', { body }) : api(`/quy-tac-chung-tu/${sua}`, { method: 'PUT', body })), 'Đã lưu quy tắc. Lô đang mở nhận quy tắc mới khi bấm "Cập nhật theo quy tắc mới".');
    if (ok) setSua(null);
  }

  if (!toi) return null;
  const quaHan = ds.filter((q) => q.quaHanRaSoat).length;

  return (
    <KhungTrang toi={toi}>
      <p><Link href="/lo-hang">← Bảng điều phối</Link></p>
      <h1>Quy tắc chứng từ</h1>
      <p className="phu">
        Ma trận chứng từ theo ngành, thị trường và Incoterms. Checklist của từng lô xuất được sinh từ các quy tắc này. Giám đốc, Kế toán trưởng và Trưởng phòng kinh doanh rà soát; quy tắc quá 12 tháng chưa rà soát sẽ được đánh dấu.
      </p>
      <div className="hang" style={{ maxWidth: 640 }}>
        {chon('lt', 'Thị trường', thiTruong, setThiTruong, THI_TRUONG, 'Tất cả')}
        {chon('ln', 'Ngành', nganh, setNganh, NGANH, 'Tất cả')}
        {coTheSua && <button onClick={() => moSua(null)}>Thêm quy tắc</button>}
      </div>
      {quaHan > 0 && <div className="loi">{quaHan} quy tắc quá 12 tháng chưa rà soát.</div>}
      {thongBao && <div className="dat" role="status">{thongBao}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}

      {sua && (
        <form className="o" style={{ marginTop: 16 }} onSubmit={luu}>
          <strong>{sua === 'moi' ? 'Thêm quy tắc' : `Sửa quy tắc ${f.ma}`}</strong>
          <div className="hang">
            <div><label htmlFor="qma">Mã (chữ thường, số, gạch dưới)</label><input id="qma" required value={f.ma} onChange={(e) => setF({ ...f, ma: e.target.value })} /></div>
            <div style={{ flexBasis: 360 }}><label htmlFor="qten">Tên chứng từ</label><input id="qten" required value={f.ten} onChange={(e) => setF({ ...f, ten: e.target.value })} /></div>
          </div>
          <div className="hang">
            {chon('qtt', 'Thị trường', f.thiTruong, (v) => setF({ ...f, thiTruong: v }), THI_TRUONG, 'Mọi thị trường')}
            {chon('qn', 'Ngành', f.nganh, (v) => setF({ ...f, nganh: v }), NGANH, 'Mọi ngành')}
            {chon('qlg', 'Loại giao dịch', f.loaiGiaoDich, (v) => setF({ ...f, loaiGiaoDich: v }), LOAI_GIAO_DICH, 'Cả hai')}
            <div><label htmlFor="qinc">Chỉ khi Incoterms (để trống nếu mọi điều kiện)</label><input id="qinc" value={f.incoterms} onChange={(e) => setF({ ...f, incoterms: e.target.value })} placeholder="VD: CIF, CIP" /></div>
          </div>
          <div className="hang">
            {chon('qyc', 'Yêu cầu', f.yeuCau, (v) => setF({ ...f, yeuCau: v }), YEU_CAU)}
            {chon('qgd', 'Giai đoạn', f.giaiDoan, (v) => setF({ ...f, giaiDoan: v }), GIAI_DOAN)}
            {chon('qpv', 'Phạm vi', f.phamVi, (v) => setF({ ...f, phamVi: v }), PHAM_VI)}
            {chon('qbl', 'Bên làm', f.benLam, (v) => setF({ ...f, benLam: v }), BEN_LAM)}
          </div>
          <div className="hang">
            <div><label htmlFor="qnc">Nơi cấp</label><input id="qnc" value={f.noiCap} onChange={(e) => setF({ ...f, noiCap: e.target.value })} /></div>
            <div style={{ flexBasis: 360 }}><label htmlFor="qcc">Căn cứ pháp lý</label><input id="qcc" value={f.canCu} onChange={(e) => setF({ ...f, canCu: e.target.value })} /></div>
          </div>
          <label htmlFor="qgc">Ghi chú</label>
          <input id="qgc" value={f.ghiChu} onChange={(e) => setF({ ...f, ghiChu: e.target.value })} />
          <div className="hang" style={{ marginTop: 12 }}>
            <label style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.chuaChac} onChange={(e) => setF({ ...f, chuaChac: e.target.checked })} />Căn cứ chưa chắc chắn, cần xác minh</label>
            <label style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.hieuLuc} onChange={(e) => setF({ ...f, hieuLuc: e.target.checked })} />Đang áp dụng</label>
          </div>
          <div className="hang" style={{ marginTop: 12 }}>
            <button>Lưu</button>
            <button type="button" className="phu-btn" onClick={() => setSua(null)}>Thôi</button>
          </div>
        </form>
      )}

      <div className="bang-cuon" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Chứng từ</th><th>Áp dụng cho</th><th>Yêu cầu</th><th>Bên làm, phạm vi</th><th>Rà soát</th><th></th></tr></thead>
          <tbody>
            {ds.map((q) => (
              <tr key={q.id} className={q.active ? '' : 'huy'}>
                <td>
                  {q.name}
                  {q.legalBasis && <div className="phu">{q.legalBasis}</div>}
                  {q.uncertain && <div className="kyc-canh-bao" style={{ fontWeight: 400, fontSize: 13 }}>Căn cứ chưa chắc chắn</div>}
                  {q.note && <div className="phu">{q.note}</div>}
                </td>
                <td>
                  {q.market ? THI_TRUONG[q.market] : 'Mọi thị trường'} · {q.sector ? NGANH[q.sector] : 'mọi ngành'}
                  {q.incoterms?.length ? <div className="phu">chỉ khi {q.incoterms.join(', ')}</div> : null}
                  {q.dealType && <div className="phu">{LOAI_GIAO_DICH[q.dealType]}</div>}
                </td>
                <td><span className="nhan">{YEU_CAU[q.requirement]}</span><div className="phu">{GIAI_DOAN[q.stage]}</div></td>
                <td>{BEN_LAM[q.party]}<div className="phu">{PHAM_VI[q.scope]}</div></td>
                <td className={q.quaHanRaSoat ? 'kyc-canh-bao' : ''}>{ngay(q.reviewedAt)}<div className="phu">{q.updatedByName ?? 'Khởi tạo'}</div></td>
                <td>
                  {coTheSua && (
                    <div className="hang" style={{ gap: 6 }}>
                      <button className="phu-btn nho" onClick={() => moSua(q)}>Sửa</button>
                      <button className="phu-btn nho" onClick={() => lam(() => api(`/quy-tac-chung-tu/${q.id}/da-ra-soat`, { method: 'POST' }), `Đã ghi rà soát: ${q.name}.`)}>Đã rà soát</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </KhungTrang>
  );
}
