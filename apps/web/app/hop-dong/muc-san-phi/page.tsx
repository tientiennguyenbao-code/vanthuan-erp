'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface ThongKe {
  soHopDong: number;
  trungBinh: number | null;
  trungVi: number | null;
  thapNhat: number | null;
  caoNhat: number | null;
}

export default function MucSanPhi() {
  const toi = useToi();
  const [san, setSan] = useState<number | null>(null);
  const [nhap, setNhap] = useState('');
  const [tk, setTk] = useState<ThongKe | null>(null);
  const [loi, setLoi] = useState('');
  const [thongBao, setThongBao] = useState('');
  const coTheDat = toi?.quyen.includes('PHI_DUYET_TY_LE') ?? false;

  const tai = useCallback(async () => {
    const r = await api<{ sanTyLePhi: number | null }>('/phi/muc-san');
    setSan(r.sanTyLePhi);
    setNhap(r.sanTyLePhi === null ? '' : String(r.sanTyLePhi));
    api<ThongKe>('/phi/goi-y').then(setTk).catch(() => setTk(null));
  }, []);

  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  async function luu(e: FormEvent, giaTri: number | null) {
    e.preventDefault();
    setLoi('');
    setThongBao('');
    try {
      await api('/phi/muc-san', { method: 'PUT', body: { sanTyLePhi: giaTri } });
      await tai();
      setThongBao(giaTri === null ? 'Đã bỏ mức sàn. Mọi tỷ lệ phí đều không cần duyệt riêng.' : `Đã đặt mức sàn ${giaTri}%. Hợp đồng có phí thấp hơn sẽ cần Ban Giám đốc duyệt trước khi ký.`);
    } catch (err) {
      setLoi((err as Error).message);
    }
  }

  if (!toi) return null;
  const so = Number(nhap.replace(',', '.'));

  return (
    <KhungTrang toi={toi}>
      <p><Link href="/hop-dong">← Hợp đồng</Link></p>
      <h1>Mức sàn phí trọn gói</h1>
      <p className="phu">
        Phí trọn gói do bên bán trả, tính theo % giá trị lô hàng và đàm phán theo từng hợp đồng. Hợp đồng mua hoặc hợp đồng môi giới có tỷ lệ phí thấp hơn mức sàn
        vẫn soạn và trình ký được, nhưng Ban Giám đốc phải bấm duyệt phí trước khi ký. Việc duyệt được ghi vào sổ cái của hợp đồng.
      </p>
      {thongBao && <div className="dat" role="status">{thongBao}</div>}
      {loi && <div className="loi" role="alert">{loi}</div>}

      <div className="luoi" style={{ marginTop: 16 }}>
        <div className="o">
          <strong>Mức sàn hiện tại</strong>
          <div style={{ fontSize: 24 }}>{san === null ? 'Chưa đặt' : `${san}%`}</div>
        </div>
        <div className="o">
          <strong>Các hợp đồng đã ký</strong>
          {tk && tk.soHopDong > 0 ? (
            <>
              <div>{tk.soHopDong} hợp đồng có phí</div>
              <div className="phu">Phổ biến {tk.trungVi}%, trung bình {tk.trungBinh}%, từ {tk.thapNhat}% đến {tk.caoNhat}%</div>
            </>
          ) : (
            <div className="phu">Chưa có hợp đồng có phí nào được ký.</div>
          )}
        </div>
      </div>

      {coTheDat ? (
        <form className="o" style={{ marginTop: 16, maxWidth: 480 }} onSubmit={(e) => luu(e, so)}>
          <label htmlFor="san">Mức sàn mới (%)</label>
          <input id="san" inputMode="decimal" required value={nhap} onChange={(e) => setNhap(e.target.value)} placeholder="VD: 1,2" />
          <div className="hang" style={{ marginTop: 12 }}>
            <button disabled={!nhap || Number.isNaN(so) || so < 0 || so > 100}>Lưu mức sàn</button>
            {san !== null && <button type="button" className="phu-btn" onClick={(e) => luu(e as unknown as FormEvent, null)}>Bỏ mức sàn</button>}
          </div>
        </form>
      ) : (
        <p className="phu">Chỉ Ban Giám đốc đặt được mức sàn.</p>
      )}
    </KhungTrang>
  );
}
