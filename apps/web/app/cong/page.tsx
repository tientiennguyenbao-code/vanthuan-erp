'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { kg, LOAI_GIAO_DICH, THI_TRUONG, TRANG_THAI_LO_XUAT } from '@/lib/lo-hang';
import { ngay } from '@/lib/nhan';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../khung-trang';

interface LoCuaToi {
  id: string;
  code: string;
  dealType: string;
  status: string;
  market: string;
  commodityName: string;
  etd: string | null;
  buyerName: string | null;
  ngayDenCutoff: number | null;
  khoiLuongCuaToiKg: number;
  laNhaCungCapChinh: boolean;
  chungTuBatBuoc: number;
  chungTuDaDu: number;
  biTraLai: number;
}

export default function CongNhaCungCap() {
  const toi = useToi();
  const [ds, setDs] = useState<LoCuaToi[] | null>(null);
  const [loi, setLoi] = useState('');
  useEffect(() => {
    if (toi) api<{ lo: LoCuaToi[] }>('/cong/lo').then((r) => setDs(r.lo)).catch((e: Error) => setLoi(e.message));
  }, [toi]);
  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <h1>Lô hàng của quý công ty</h1>
      <p className="phu">Các lô xuất đang có hàng của quý công ty. Bấm vào lô để cập nhật và nộp chứng từ phần mình.</p>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {ds && ds.length === 0 && <p className="phu">Chưa có lô nào.</p>}
      <div className="luoi">
        {ds?.map((l) => (
          <Link key={l.id} href={`/cong/lo/${l.id}`} className="o the-lo">
            <strong>{l.code}</strong> <span className="nhan">{TRANG_THAI_LO_XUAT[l.status]}</span>
            <div>{l.commodityName} · {THI_TRUONG[l.market]} · {LOAI_GIAO_DICH[l.dealType]}</div>
            {l.buyerName && <div className="phu">Người mua: {l.buyerName}</div>}
            <div className="phu">Hàng của quý công ty: {kg(l.khoiLuongCuaToiKg)} · tàu dự kiến {ngay(l.etd)}</div>
            {l.laNhaCungCapChinh && <div className="kyc-dat">Quý công ty là nhà cung cấp chính (đứng tên người gửi hàng)</div>}
            <div style={{ marginTop: 6 }}>
              Chứng từ bắt buộc: <strong>{l.chungTuDaDu}/{l.chungTuBatBuoc}</strong>
              {l.biTraLai > 0 && <span className="kyc-canh-bao"> · {l.biTraLai} chứng từ bị trả lại</span>}
            </div>
            {l.ngayDenCutoff !== null && l.status !== 'xep_tau' && l.status !== 'hoan_tat' && (
              <div className={l.ngayDenCutoff <= 3 ? 'kyc-canh-bao' : 'phu'}>{l.ngayDenCutoff < 0 ? 'Đã quá hạn cut-off' : `Còn ${l.ngayDenCutoff} ngày đến cut-off`}</div>
            )}
          </Link>
        ))}
      </div>
    </KhungTrang>
  );
}
