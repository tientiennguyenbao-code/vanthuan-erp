'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ngayGio } from '@/lib/nhan';
import { CACH_KIEM_RUNG, ha } from '@/lib/nguon-cung';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface KetQua {
  id: string; plotId: string; plotCode: string; areaHa: number; geometryType: string; farmerCode: string; areaCode: string; supplierId: string; supplierName: string;
  method: string; result: string; evidence: string; status: string; checkerName: string; checkedAt: string; reviewerName: string | null; reviewedAt: string | null;
  reviewNote: string | null; laCuaToi: boolean;
}
const TRANG_THAI: Record<string, string> = { cho_duyet: 'Chờ duyệt', da_duyet: 'Đã duyệt', tu_choi: 'Trả lại', het_hieu_luc: 'Hết hiệu lực (thửa đo lại)' };

/** Danh sách kết quả kiểm tra rừng; người có quyền duyệt chọn nhiều dòng để duyệt hoặc trả lại. */
export default function KiemTraRung() {
  const toi = useToi();
  const [trangThai, setTrangThai] = useState('cho_duyet');
  const [d, setD] = useState<{ duocDuyet: boolean; ketQua: KetQua[] } | null>(null);
  const [chon, setChon] = useState<string[]>([]);
  const [ghiChu, setGhiChu] = useState('');
  const [loi, setLoi] = useState('');
  const [tb, setTb] = useState('');
  const tai = useCallback(() => api<{ duocDuyet: boolean; ketQua: KetQua[] }>(`/kiem-tra-rung${trangThai ? `?trangThai=${trangThai}` : ''}`).then((r) => { setD(r); setChon([]); }), [trangThai]);
  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);
  if (!toi) return null;

  async function duyet(dongY: boolean) {
    setLoi('');
    setTb('');
    try {
      await api('/kiem-tra-rung/duyet', { body: { ids: chon, dongY, ghiChu: ghiChu.trim() || null } });
      setTb(dongY ? `Đã duyệt ${chon.length} kết quả.` : `Đã trả lại ${chon.length} kết quả.`);
      setGhiChu('');
      await tai();
    } catch (e) {
      setLoi((e as Error).message);
    }
  }
  const coTheChon = (k: KetQua) => !!d?.duocDuyet && k.status === 'cho_duyet' && !k.laCuaToi;
  const chonDuoc = d?.ketQua.filter(coTheChon) ?? [];

  return (
    <KhungTrang toi={toi}>
      <p><Link href="/nguon-cung">← Nguồn cung</Link></p>
      <h1>Kiểm tra rừng</h1>
      <p className="phu">Mỗi thửa cà phê phải được đối chiếu với bản đồ rừng 2020 và có người thứ hai duyệt kết quả. Chỉ thửa "không rừng" đã duyệt mới cho hàng đủ EUDR. Người ghi kết quả không tự duyệt.</p>
      {tb && <div className="dat" role="status">{tb}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}
      <div className="hang" style={{ maxWidth: 320 }}>
        <div><label htmlFor="tt">Trạng thái</label>
          <select id="tt" value={trangThai} onChange={(e) => setTrangThai(e.target.value)}>
            <option value="cho_duyet">Chờ duyệt</option><option value="da_duyet">Đã duyệt</option><option value="tu_choi">Trả lại</option><option value="">Tất cả</option>
          </select>
        </div>
      </div>
      <div className="bang-cuon" style={{ marginTop: 12 }}>
        <table>
          <thead><tr>
            {d?.duocDuyet && <th><input type="checkbox" aria-label="Chọn tất cả" checked={chonDuoc.length > 0 && chon.length === chonDuoc.length} onChange={(e) => setChon(e.target.checked ? chonDuoc.map((k) => k.id) : [])} /></th>}
            <th>Thửa</th><th>Nhà cung cấp</th><th>Kết quả</th><th>Cách kiểm, căn cứ</th><th>Người kiểm</th><th>Tình trạng</th>
          </tr></thead>
          <tbody>
            {d?.ketQua.length === 0 && <tr><td colSpan={7} className="phu">Không có kết quả nào.</td></tr>}
            {d?.ketQua.map((k) => (
              <tr key={k.id}>
                {d.duocDuyet && <td>{coTheChon(k) && <input type="checkbox" aria-label={`Chọn ${k.plotCode}`} checked={chon.includes(k.id)} onChange={(e) => setChon(e.target.checked ? [...chon, k.id] : chon.filter((x) => x !== k.id))} />}</td>}
                <td>{k.plotCode}<div className="phu">hộ {k.farmerCode} · {ha(k.areaHa)} · {k.geometryType === 'diem' ? 'một điểm' : 'ranh giới'}</div></td>
                <td><Link href={`/nguon-cung/${k.supplierId}`}>{k.supplierName}</Link><div className="phu">{k.areaCode}</div></td>
                <td className={k.result === 'khong_rung' ? 'kyc-dat' : 'kyc-canh-bao'}>{k.result === 'khong_rung' ? 'Không rừng' : 'Có rừng sau 2020'}</td>
                <td>{CACH_KIEM_RUNG[k.method]}<div className="phu">{k.evidence}</div></td>
                <td>{k.checkerName}<div className="phu">{ngayGio(k.checkedAt)}</div></td>
                <td>{TRANG_THAI[k.status]}{k.reviewerName && <div className="phu">{k.reviewerName} · {ngayGio(k.reviewedAt)}</div>}{k.reviewNote && <div className="phu">{k.reviewNote}</div>}{k.laCuaToi && k.status === 'cho_duyet' && <div className="phu">Bạn ghi kết quả này nên người khác duyệt</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d?.duocDuyet && chonDuoc.length > 0 && (
        <div className="o" style={{ marginTop: 12, maxWidth: 640 }}>
          <strong>Đã chọn {chon.length} kết quả</strong>
          <label htmlFor="gc">Ghi chú (bắt buộc khi trả lại)</label>
          <input id="gc" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button disabled={chon.length === 0} onClick={() => duyet(true)}>Duyệt</button>
            <button className="phu-btn" disabled={chon.length === 0} onClick={() => duyet(false)}>Trả lại</button>
          </div>
        </div>
      )}
    </KhungTrang>
  );
}
