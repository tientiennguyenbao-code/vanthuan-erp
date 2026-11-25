'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api, Buoc, trangTheoBuoc } from '@/lib/api';

export default function DangNhap() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [loi, setLoi] = useState('');
  const [dangGui, setDangGui] = useState(false);

  async function gui(e: FormEvent) {
    e.preventDefault();
    setLoi('');
    setDangGui(true);
    try {
      const r = await api<{ buoc: Buoc }>('/auth/dang-nhap', { body: { email, matKhau } });
      router.replace(trangTheoBuoc(r.buoc));
    } catch (err) {
      setLoi((err as Error).message);
    } finally {
      setDangGui(false);
    }
  }

  return (
    <div className="khung-giua">
      <form className="the" onSubmit={gui}>
        <h1>Đăng nhập</h1>
        <p className="phu">Phần mềm quản trị vận hành Vạn Thuận Global</p>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="mk">Mật khẩu</label>
        <input id="mk" type="password" autoComplete="current-password" required value={matKhau} onChange={(e) => setMatKhau(e.target.value)} />
        {loi && <div className="loi" role="alert">{loi}</div>}
        <button className="day-du" disabled={dangGui}>{dangGui ? 'Đang kiểm tra…' : 'Tiếp tục'}</button>
      </form>
    </div>
  );
}
