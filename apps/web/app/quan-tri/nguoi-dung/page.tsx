'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../../khung-trang';

interface NguoiDung {
  id: string;
  email: string;
  hoTen: string;
  trangThai: 'hoat_dong' | 'bi_khoa' | 'vo_hieu';
  vaiTro: string[];
  daCai2Lop: boolean;
  lanDangNhapCuoi: string | null;
}
interface VaiTro {
  ma: string;
  ten: string;
}

const TRANG_THAI: Record<NguoiDung['trangThai'], string> = { hoat_dong: 'Hoạt động', bi_khoa: 'Bị khoá', vo_hieu: 'Đã vô hiệu' };

function ChonVaiTro({ tatCa, chon, doi }: { tatCa: VaiTro[]; chon: string[]; doi: (v: string[]) => void }) {
  return (
    <div className="chon-vai-tro">
      {tatCa.map((v) => (
        <label key={v.ma}>
          <input
            type="checkbox"
            checked={chon.includes(v.ma)}
            onChange={(e) => doi(e.target.checked ? [...chon, v.ma] : chon.filter((x) => x !== v.ma))}
          />
          {v.ten}
        </label>
      ))}
    </div>
  );
}

export default function QuanLyNguoiDung() {
  const toi = useToi();
  const [ds, setDs] = useState<NguoiDung[]>([]);
  const [vaiTro, setVaiTro] = useState<VaiTro[]>([]);
  const [loi, setLoi] = useState('');
  const [thongBao, setThongBao] = useState('');
  const [email, setEmail] = useState('');
  const [hoTen, setHoTen] = useState('');
  const [chon, setChon] = useState<string[]>([]);
  const [dangSua, setDangSua] = useState<{ id: string; vaiTro: string[] } | null>(null);

  const tai = useCallback(async () => {
    const [n, v] = await Promise.all([
      api<{ nguoiDung: NguoiDung[] }>('/nguoi-dung'),
      api<{ vaiTro: VaiTro[] }>('/nguoi-dung/vai-tro'),
    ]);
    setDs(n.nguoiDung);
    setVaiTro(v.vaiTro);
  }, []);

  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  const tenVaiTro = (ma: string) => vaiTro.find((v) => v.ma === ma)?.ten ?? ma;

  async function lam(viec: () => Promise<unknown>, xong: string) {
    setLoi('');
    setThongBao('');
    try {
      await viec();
      if (xong) setThongBao(xong);
      await tai();
    } catch (e) {
      setLoi((e as Error).message);
    }
  }

  async function tao(e: FormEvent) {
    e.preventDefault();
    await lam(async () => {
      const r = await api<{ matKhauTam: string }>('/nguoi-dung', { body: { email, hoTen, vaiTro: chon } });
      setEmail('');
      setHoTen('');
      setChon([]);
      setThongBao(`Đã tạo tài khoản ${email}. Mật khẩu tạm (chỉ hiện một lần, hãy gửi riêng cho người dùng): ${r.matKhauTam}`);
    }, '');
  }

  async function datLai(n: NguoiDung) {
    await lam(async () => {
      const r = await api<{ matKhauTam: string }>(`/nguoi-dung/${n.id}/dat-lai`, { method: 'POST' });
      setThongBao(`Đã đặt lại ${n.email}. Mật khẩu tạm mới: ${r.matKhauTam}. Người dùng phải cài lại xác thực 2 lớp.`);
    }, '');
  }

  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <h1>Tài khoản người dùng</h1>
      {loi && <div className="loi" role="alert">{loi}</div>}
      {thongBao && <div className="dat">{thongBao}</div>}

      <div className="bang-cuon" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr>
          </thead>
          <tbody>
            {ds.map((n) => (
              <tr key={n.id}>
                <td>{n.hoTen}</td>
                <td>{n.email}</td>
                <td>
                  {dangSua?.id === n.id ? (
                    <>
                      <ChonVaiTro tatCa={vaiTro} chon={dangSua.vaiTro} doi={(v) => setDangSua({ id: n.id, vaiTro: v })} />
                      <button className="nho" onClick={() => lam(() => api(`/nguoi-dung/${n.id}/vai-tro`, { method: 'PUT', body: { vaiTro: dangSua.vaiTro } }).then(() => setDangSua(null)), 'Đã đổi vai trò. Người dùng sẽ phải đăng nhập lại.')}>Lưu</button>{' '}
                      <button className="nho phu-btn" onClick={() => setDangSua(null)}>Huỷ</button>
                    </>
                  ) : (
                    n.vaiTro.map((v) => <span className="nhan" key={v}>{tenVaiTro(v)}</span>)
                  )}
                </td>
                <td>
                  {TRANG_THAI[n.trangThai]}
                  {!n.daCai2Lop && <div className="phu">Chưa cài 2 lớp</div>}
                </td>
                <td>
                  {n.id !== toi.id && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="nho phu-btn" onClick={() => setDangSua({ id: n.id, vaiTro: n.vaiTro })}>Đổi vai trò</button>
                      {n.trangThai === 'bi_khoa' && <button className="nho" onClick={() => lam(() => api(`/nguoi-dung/${n.id}/mo-khoa`, { method: 'POST' }), 'Đã mở khoá.')}>Mở khoá</button>}
                      {n.trangThai === 'vo_hieu' ? (
                        <button className="nho phu-btn" onClick={() => lam(() => api(`/nguoi-dung/${n.id}/kich-hoat`, { method: 'POST' }), 'Đã kích hoạt lại.')}>Kích hoạt</button>
                      ) : (
                        <button className="nho phu-btn" onClick={() => lam(() => api(`/nguoi-dung/${n.id}/vo-hieu`, { method: 'POST' }), 'Đã vô hiệu hoá.')}>Vô hiệu</button>
                      )}
                      <button className="nho phu-btn" onClick={() => datLai(n)}>Đặt lại (mất điện thoại)</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Thêm tài khoản</h2>
      <form className="o" onSubmit={tao}>
        <label htmlFor="ht">Họ tên</label>
        <input id="ht" required value={hoTen} onChange={(e) => setHoTen(e.target.value)} />
        <label htmlFor="em">Email</label>
        <input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>Vai trò</label>
        <ChonVaiTro tatCa={vaiTro} chon={chon} doi={setChon} />
        <button style={{ marginTop: 16 }}>Tạo tài khoản</button>
      </form>
    </KhungTrang>
  );
}
