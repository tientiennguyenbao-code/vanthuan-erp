'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';

export default function DoiMatKhau() {
  const router = useRouter();
  const [cu, setCu] = useState('');
  const [moi, setMoi] = useState('');
  const [nhapLai, setNhapLai] = useState('');
  const [loi, setLoi] = useState('');

  async function gui(e: FormEvent) {
    e.preventDefault();
    setLoi('');
    if (moi !== nhapLai) return setLoi('Hai lần nhập mật khẩu mới không giống nhau / The two new passwords do not match');
    try {
      await api('/auth/doi-mat-khau', { body: { matKhauCu: cu, matKhauMoi: moi } });
      router.replace('/');
    } catch (err) {
      setLoi((err as Error).message);
    }
  }

  return (
    <div className="khung-giua">
      <form className="the" onSubmit={gui}>
        <h1>Đặt mật khẩu mới <span className="phu" style={{ fontSize: 16, fontWeight: 400 }}>/ Set a new password</span></h1>
        <p className="phu">Mật khẩu ít nhất 10 ký tự, có cả chữ và số, không chứa tên đăng nhập.<br />At least 10 characters, with letters and numbers, not containing your login name.</p>
        <label htmlFor="cu">Mật khẩu hiện tại (mật khẩu tạm) / Current (temporary) password</label>
        <input id="cu" type="password" autoComplete="current-password" required value={cu} onChange={(e) => setCu(e.target.value)} />
        <label htmlFor="moi">Mật khẩu mới / New password</label>
        <input id="moi" type="password" autoComplete="new-password" required value={moi} onChange={(e) => setMoi(e.target.value)} />
        <label htmlFor="lai">Nhập lại mật khẩu mới / Repeat new password</label>
        <input id="lai" type="password" autoComplete="new-password" required value={nhapLai} onChange={(e) => setNhapLai(e.target.value)} />
        {loi && <div className="loi" role="alert">{loi}</div>}
        <button className="day-du">Lưu mật khẩu / Save password</button>
      </form>
    </div>
  );
}
