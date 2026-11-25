'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToi } from '@/lib/use-toi';
import { KhungTrang } from '../khung-trang';

interface Dong {
  id: number;
  at: string;
  actorUserId: string | null;
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  detail: Record<string, unknown>;
}

const TEN_THAO_TAC: Record<string, string> = {
  'dang_nhap.dung_mat_khau': 'Nhập đúng mật khẩu',
  'dang_nhap.thanh_cong': 'Đăng nhập thành công',
  'dang_nhap.nhap_sai': 'Nhập sai',
  'dang_nhap.sai_email': 'Đăng nhập bằng email không tồn tại',
  dang_xuat: 'Đăng xuất',
  'xac_thuc_2_lop.da_cai': 'Cài xác thực 2 lớp',
  'mat_khau.da_doi': 'Đổi mật khẩu',
  'tai_khoan.tao': 'Tạo tài khoản',
  'tai_khoan.doi_vai_tro': 'Đổi vai trò',
  'tai_khoan.bi_khoa': 'Tài khoản bị khoá',
  'tai_khoan.mo_khoa': 'Mở khoá tài khoản',
  'tai_khoan.vo_hieu': 'Vô hiệu hoá tài khoản',
  'tai_khoan.kich_hoat': 'Kích hoạt tài khoản',
  'tai_khoan.dat_lai': 'Đặt lại tài khoản',
};

export default function NhatKy() {
  const toi = useToi();
  const [dong, setDong] = useState<Dong[]>([]);
  const [kiemTra, setKiemTra] = useState<{ ok: boolean; checked: number; brokenAtId?: number } | null>(null);
  const [loi, setLoi] = useState('');

  const tai = useCallback(async (truocId?: number) => {
    const r = await api<{ dong: Dong[] }>(`/nhat-ky?soDong=50${truocId ? `&truocId=${truocId}` : ''}`);
    setDong((cu) => (truocId ? [...cu, ...r.dong] : r.dong));
  }, []);

  useEffect(() => {
    if (toi) tai().catch((e: Error) => setLoi(e.message));
  }, [toi, tai]);

  if (!toi) return null;
  return (
    <KhungTrang toi={toi}>
      <h1>Nhật ký thao tác</h1>
      <p className="phu">Mọi thao tác quan trọng đều được ghi lại và không ai sửa hoặc xoá được.</p>
      <button className="phu-btn" onClick={() => api<typeof kiemTra>('/nhat-ky/kiem-tra').then(setKiemTra).catch((e: Error) => setLoi(e.message))}>
        Kiểm tra nhật ký còn nguyên vẹn
      </button>
      {kiemTra && (
        <div className={kiemTra.ok ? 'dat' : 'loi'}>
          {kiemTra.ok
            ? `Nguyên vẹn: đã kiểm ${kiemTra.checked} dòng, không dòng nào bị sửa hay rút bỏ.`
            : `Cảnh báo: dòng số ${kiemTra.brokenAtId} đã bị can thiệp. Báo ngay cho kỹ sư.`}
        </div>
      )}
      {loi && <div className="loi" role="alert">{loi}</div>}
      <div className="bang-cuon" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr><th>Số</th><th>Thời điểm</th><th>Thao tác</th><th>Người làm</th><th>Địa chỉ IP</th><th>Chi tiết</th></tr>
          </thead>
          <tbody>
            {dong.map((d) => (
              <tr key={d.id}>
                <td>{d.id}</td>
                <td>{new Date(d.at).toLocaleString('vi-VN')}</td>
                <td>{TEN_THAO_TAC[d.action] ?? d.action}</td>
                <td>{d.actorName ?? '—'}</td>
                <td>{d.ip ?? '—'}</td>
                <td><code>{JSON.stringify(d.detail)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dong.length > 0 && dong.length % 50 === 0 && (
        <button className="phu-btn" style={{ marginTop: 12 }} onClick={() => tai(dong[dong.length - 1].id)}>Xem thêm</button>
      )}
    </KhungTrang>
  );
}
