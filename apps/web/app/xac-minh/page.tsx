'use client';

import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ngayGio } from '@/lib/nhan';

interface KetQua {
  hopLe: boolean;
  phienBan?: number;
  kyLuc?: string;
  tinhTrang?: 'con_hieu_luc' | 'da_co_phu_luc_moi' | 'da_huy';
  chuKy?: { loai: string | null; hopLe: boolean };
  soCai?: { maBanGhi: string } | null;
  neo?: { dotNeo: number; luc: string; maGoc: string; noiNeo: string; maGiaoDich: string | null; khopMaGoc: boolean } | null;
}

const TINH_TRANG: Record<string, string> = {
  con_hieu_luc: 'Đây là bản đang có hiệu lực.',
  da_co_phu_luc_moi: 'Bản này đã được ký, nhưng sau đó đã có phụ lục mới thay thế. Hãy đối chiếu bản mới nhất.',
  da_huy: 'Hợp đồng này đã bị huỷ.',
};

function XacMinh() {
  const params = useSearchParams();
  const [ma, setMa] = useState(params.get('ma') ?? '');
  const [kq, setKq] = useState<KetQua | null>(null);
  const [loi, setLoi] = useState('');

  async function kiemTra(code: string) {
    setLoi('');
    setKq(null);
    try {
      setKq(await api<KetQua>(`/xac-minh/${encodeURIComponent(code.trim())}`));
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  useEffect(() => {
    const m = params.get('ma');
    if (m) kiemTra(m);
  }, [params]);

  return (
    <main className="trang" style={{ maxWidth: 720 }}>
      <h1>Xác minh hợp đồng Vạn Thuận Global</h1>
      <p className="phu">
        Nhập mã xác minh in trên hợp đồng (64 ký tự). Trang này chỉ trả lời bản của anh/chị có đúng là bản đã ký hay không;
        không hiển thị tên các bên, giá hay điều khoản.
      </p>
      <form className="o" onSubmit={(e: FormEvent) => { e.preventDefault(); kiemTra(ma); }}>
        <label htmlFor="ma">Mã xác minh</label>
        <input id="ma" required value={ma} onChange={(e) => setMa(e.target.value)} placeholder="VD: 3F2A-9C1B-…" style={{ fontFamily: 'monospace' }} />
        <button style={{ marginTop: 12 }}>Kiểm tra</button>
      </form>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {kq && !kq.hopLe && <div className="loi" role="status">Không tìm thấy bản hợp đồng đã ký nào có mã này. Bản anh/chị đang giữ có thể đã bị sửa, hoặc mã nhập sai.</div>}
      {kq?.hopLe && (
        <div className={kq.tinhTrang === 'con_hieu_luc' ? 'dat' : 'loi'} role="status">
          <strong>Khớp với bản đã ký</strong> (phiên bản {kq.phienBan}, ký lúc {ngayGio(kq.kyLuc)}).
          <div>{TINH_TRANG[kq.tinhTrang!]}</div>
          <ul style={{ margin: '8px 0 0' }}>
            <li>Chữ ký: {kq.chuKy?.hopLe ? 'hợp lệ' : 'không kiểm được'}{kq.chuKy?.loai === 'noi_bo_tam_thoi' ? ' (chữ ký nội bộ tạm thời)' : ''}</li>
            <li>
              Neo: {kq.neo ? <>đợt {kq.neo.dotNeo} lúc {ngayGio(kq.neo.luc)}, đường đi trong cây {kq.neo.khopMaGoc ? 'khớp' : 'KHÔNG khớp'} mã gốc
                {kq.neo.maGiaoDich ? <> · mã giao dịch {kq.neo.maGiaoDich}</> : kq.neo.noiNeo === 'noi_bo' ? ' (đang lưu nội bộ, chưa ghi ra blockchain công khai)' : ''}</> : 'chưa neo (sẽ có trong đợt neo tới)'}
            </li>
          </ul>
          {kq.neo && <div className="phu" style={{ marginTop: 6, wordBreak: 'break-all', fontSize: 12 }}>Mã gốc: {kq.neo.maGoc}</div>}
        </div>
      )}
    </main>
  );
}

export default function TrangXacMinh() {
  return (
    <Suspense fallback={null}>
      <XacMinh />
    </Suspense>
  );
}
