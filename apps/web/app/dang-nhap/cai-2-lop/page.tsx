'use client';

import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { FormEvent, useEffect, useState } from 'react';
import { api, Buoc, trangTheoBuoc } from '@/lib/api';

export default function Cai2Lop() {
  const router = useRouter();
  const [qr, setQr] = useState('');
  const [maBiMat, setMaBiMat] = useState('');
  const [ma, setMa] = useState('');
  const [loi, setLoi] = useState('');

  useEffect(() => {
    api<{ maBiMat: string; otpauthUrl: string }>('/auth/cai-2-lop/bat-dau', { method: 'POST' })
      .then(async (r) => {
        setMaBiMat(r.maBiMat);
        setQr(await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 220 }));
      })
      .catch(() => router.replace('/dang-nhap'));
  }, [router]);

  async function gui(e: FormEvent) {
    e.preventDefault();
    setLoi('');
    try {
      const r = await api<{ buoc: Buoc }>('/auth/cai-2-lop/xac-nhan', { body: { ma } });
      router.replace(trangTheoBuoc(r.buoc));
    } catch (err) {
      setLoi((err as Error).message);
      setMa('');
    }
  }

  return (
    <div className="khung-giua">
      <form className="the" onSubmit={gui}>
        <h1>Cài đặt xác thực 2 lớp</h1>
        <p className="phu">Bắt buộc một lần cho mỗi tài khoản, để người khác có mật khẩu của bạn cũng không vào được.</p>
        <ol>
          <li>Cài ứng dụng <strong>Google Authenticator</strong> hoặc <strong>Microsoft Authenticator</strong> trên điện thoại.</li>
          <li>Trong ứng dụng, chọn thêm tài khoản rồi quét mã dưới đây.</li>
          <li>Nhập mã 6 số ứng dụng hiện ra.</li>
        </ol>
        {qr ? <img src={qr} alt="Mã QR để cài xác thực 2 lớp" width={220} height={220} /> : <p className="phu">Đang tạo mã…</p>}
        {maBiMat && (
          <p className="phu">
            Không quét được? Nhập tay mã này: <code>{maBiMat}</code>
          </p>
        )}
        <label htmlFor="ma">Mã 6 số</label>
        <input id="ma" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={ma} onChange={(e) => setMa(e.target.value.replace(/\D/g, ''))} />
        {loi && <div className="loi" role="alert">{loi}</div>}
        <button className="day-du">Hoàn tất cài đặt</button>
      </form>
    </div>
  );
}
