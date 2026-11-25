'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api, ApiError, Buoc, trangTheoBuoc } from '@/lib/api';

export default function NhapMa2Lop() {
  const router = useRouter();
  const [ma, setMa] = useState('');
  const [loi, setLoi] = useState('');
  const [dangGui, setDangGui] = useState(false);

  async function gui(e: FormEvent) {
    e.preventDefault();
    setLoi('');
    setDangGui(true);
    try {
      const r = await api<{ buoc: Buoc }>('/auth/ma-2-lop', { body: { ma } });
      router.replace(trangTheoBuoc(r.buoc));
    } catch (err) {
      setLoi((err as Error).message);
      setMa('');
      if (err instanceof ApiError && err.status === 401 && /khoá|hết hạn|Chưa đăng nhập/.test(err.message)) {
        setTimeout(() => router.replace('/dang-nhap'), 2500);
      }
    } finally {
      setDangGui(false);
    }
  }

  return (
    <div className="khung-giua">
      <form className="the" onSubmit={gui}>
        <h1>Mã xác thực</h1>
        <p className="phu">Mở ứng dụng xác thực trên điện thoại và nhập mã 6 số đang hiện cho Vạn Thuận Global.</p>
        <label htmlFor="ma">Mã 6 số</label>
        <input id="ma" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus value={ma} onChange={(e) => setMa(e.target.value.replace(/\D/g, ''))} />
        {loi && <div className="loi" role="alert">{loi}</div>}
        <button className="day-du" disabled={dangGui}>Xác nhận</button>
      </form>
    </div>
  );
}
