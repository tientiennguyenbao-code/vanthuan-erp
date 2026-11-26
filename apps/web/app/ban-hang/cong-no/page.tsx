'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { NHOM_TUOI_NO, THU_TU_NHOM, TuoiNo, usd } from '@/lib/cong-no';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface Dong {
  id: string;
  code: string;
  name: string;
  country: string;
  tuoiNo: TuoiNo;
  hopDongChoLenLich: number;
  duNo: number;
  hanMuc: { amountUsd: number; maxDays: number } | null;
  conLai: number | null;
  dangDeXuat: { id: string; amountUsd: number; maxDays: number } | null;
  biChan: boolean;
}
interface Data {
  nguoiMua: Dong[];
  tong: { duNo: number; quaHan: number; theoNhom: Record<string, number>; soBiChan: number };
}

export default function CongNo() {
  const toi = useToi();
  const [d, setD] = useState<Data | null>(null);
  const [loi, setLoi] = useState('');
  const [chiCoNo, setChiCoNo] = useState(false);
  useEffect(() => {
    if (toi) api<Data>('/cong-no').then(setD).catch((e: Error) => setLoi(e.message));
  }, [toi]);
  if (!toi) return null;
  const ds = (d?.nguoiMua ?? []).filter((x) => !chiCoNo || x.duNo > 0 || x.dangDeXuat);
  const choDuyet = (d?.nguoiMua ?? []).filter((x) => x.dangDeXuat).length;
  return (
    <KhungTrang toi={toi}>
      <h1>Công nợ người mua</h1>
      <p className="phu">
        Dư nợ gồm các khoản tiền hàng đã lên lịch thu mà chưa thu, cộng giá trị hợp đồng bán trả chậm đã trình hoặc đã ký nhưng chưa lên lịch thu. Hợp đồng
        trả chậm chỉ trình ký được khi nằm trong hạn mức Giám đốc đã duyệt, và người mua không có khoản nào quá hạn trên 30 ngày.
      </p>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {d && (
        <div className="luoi" style={{ marginTop: 12 }}>
          <div className="o"><div className="phu">Tổng dư nợ</div><div className="so-lon">{usd(d.tong.duNo)}</div></div>
          <div className="o"><div className="phu">Đã quá hạn</div><div className={`so-lon ${d.tong.quaHan ? 'kyc-canh-bao' : ''}`}>{usd(d.tong.quaHan)}</div></div>
          <div className="o"><div className="phu">Người mua bị chặn trả chậm</div><div className={`so-lon ${d.tong.soBiChan ? 'kyc-canh-bao' : ''}`}>{d.tong.soBiChan}</div><div className="phu">có khoản quá hạn trên 30 ngày</div></div>
          <div className="o"><div className="phu">Đề xuất hạn mức chờ duyệt</div><div className="so-lon">{choDuyet}</div></div>
        </div>
      )}
      {d && (
        <div className="bang-cuon" style={{ marginTop: 16 }}>
          <table>
            <thead><tr><th>Nhóm tuổi nợ</th>{THU_TU_NHOM.map((k) => <th key={k} className="so">{NHOM_TUOI_NO[k]}</th>)}</tr></thead>
            <tbody><tr><td>Tất cả người mua</td>{THU_TU_NHOM.map((k) => <td key={k} className={`so ${k.startsWith('qua') && d.tong.theoNhom[k] ? 'kyc-canh-bao' : ''}`}>{usd(d.tong.theoNhom[k])}</td>)}</tr></tbody>
          </table>
        </div>
      )}
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={chiCoNo} onChange={(e) => setChiCoNo(e.target.checked)} /> Chỉ người mua đang có nợ hoặc có đề xuất
      </label>
      <div className="bang-cuon" style={{ marginTop: 8 }}>
        <table>
          <thead><tr><th>Người mua</th><th className="so">Dư nợ</th><th className="so">Quá hạn</th><th className="so">Quá hạn lâu nhất</th><th className="so">Hạn mức</th><th className="so">Còn lại</th><th>Ghi chú</th></tr></thead>
          <tbody>
            {ds.length === 0 && <tr><td colSpan={7} className="phu">Chưa có người mua nào.</td></tr>}
            {ds.map((x) => (
              <tr key={x.id}>
                <td><Link href={`/ban-hang/cong-no/${x.id}`}>{x.name}</Link> <span className="phu">{x.country}</span></td>
                <td className="so">{usd(x.duNo)}{x.hopDongChoLenLich > 0 && <div className="phu">gồm {usd(x.hopDongChoLenLich)} hợp đồng chưa lên lịch</div>}</td>
                <td className={`so ${x.tuoiNo.overdue ? 'kyc-canh-bao' : ''}`}>{usd(x.tuoiNo.overdue)}</td>
                <td className="so">{x.tuoiNo.maxOverdueDays ? `${x.tuoiNo.maxOverdueDays} ngày` : '—'}</td>
                <td className="so">{x.hanMuc ? <>{usd(x.hanMuc.amountUsd)}<div className="phu">tối đa {x.hanMuc.maxDays} ngày</div></> : <span className="phu">0 (chưa duyệt)</span>}</td>
                <td className={`so ${x.conLai !== null && x.conLai < 0 ? 'kyc-canh-bao' : ''}`}>{usd(x.conLai)}</td>
                <td>
                  {x.biChan && <div className="kyc-canh-bao">Chặn trả chậm: nợ quá hạn trên 30 ngày</div>}
                  {x.dangDeXuat && <div>Đề xuất {usd(x.dangDeXuat.amountUsd)}, {x.dangDeXuat.maxDays} ngày: chờ Giám đốc duyệt</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </KhungTrang>
  );
}
