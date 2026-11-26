'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { ngayGio } from './nhan';

interface TaiKhoan { id: string; email: string; hoTen: string; trangThai: string; daCai2Lop: boolean; lanDangNhapCuoi: string | null }

const TRANG_THAI_TK: Record<string, string> = { hoat_dong: 'Đang dùng', bi_khoa: 'Bị khoá', vo_hieu: 'Đã vô hiệu' };

/** Trên trang đối tác: tài khoản cổng của nhà cung cấp và nút mời. */
export function TaiKhoanCong({ doiTacId }: { doiTacId: string }) {
  const [ds, setDs] = useState<TaiKhoan[]>([]);
  const [f, setF] = useState({ email: '', hoTen: '' });
  const [moi, setMoi] = useState<{ email: string; matKhauTam: string } | null>(null);
  const [loi, setLoi] = useState('');
  const tai = useCallback(async () => setDs((await api<{ taiKhoan: TaiKhoan[] }>(`/doi-tac/${doiTacId}/tai-khoan-cong`)).taiKhoan), [doiTacId]);
  useEffect(() => {
    tai().catch((e: Error) => setLoi(e.message));
  }, [tai]);

  async function gui(e: FormEvent) {
    e.preventDefault();
    setLoi('');
    setMoi(null);
    try {
      const r = await api<{ matKhauTam: string }>(`/doi-tac/${doiTacId}/tai-khoan-cong`, { body: f });
      setMoi({ email: f.email, matKhauTam: r.matKhauTam });
      setF({ email: '', hoTen: '' });
      await tai();
    } catch (err) {
      setLoi((err as Error).message);
    }
  }

  return (
    <div>
      <p className="phu">Người của nhà cung cấp đăng nhập để cập nhật và nộp chứng từ phần mình. Họ chỉ thấy lô có hàng của họ, không thấy giá bán và hàng của nhà cung cấp khác. Bắt buộc đăng nhập 2 lớp; không dùng 90 ngày thì tự khoá.</p>
      <div className="bang-cuon">
        <table>
          <thead><tr><th>Họ tên</th><th>Email</th><th>Tình trạng</th><th>Đăng nhập gần nhất</th></tr></thead>
          <tbody>
            {ds.map((t) => (
              <tr key={t.id}><td>{t.hoTen}</td><td>{t.email}</td><td>{TRANG_THAI_TK[t.trangThai] ?? t.trangThai}{!t.daCai2Lop && <div className="phu">chưa đăng nhập lần đầu</div>}</td><td>{ngayGio(t.lanDangNhapCuoi)}</td></tr>
            ))}
            {ds.length === 0 && <tr><td colSpan={4} className="phu">Chưa mời ai.</td></tr>}
          </tbody>
        </table>
      </div>
      <form className="o" style={{ marginTop: 12 }} onSubmit={gui}>
        <div className="hang">
          <div><label htmlFor="cghoten">Họ tên</label><input id="cghoten" required value={f.hoTen} onChange={(e) => setF({ ...f, hoTen: e.target.value })} /></div>
          <div><label htmlFor="cgemail">Email</label><input id="cgemail" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <button>Mời vào cổng</button>
        </div>
      </form>
      {moi && (
        <div className="dat" role="status">
          Đã tạo tài khoản cho {moi.email}. Mật khẩu tạm: <strong><code>{moi.matKhauTam}</code></strong>. Gửi riêng cho người này (Zalo hoặc điện thoại); họ phải đổi mật khẩu và cài đăng nhập 2 lớp ở lần đầu. Mật khẩu này không hiện lại.
        </div>
      )}
      {loi && <div className="loi" role="alert">{loi}</div>}
    </div>
  );
}
