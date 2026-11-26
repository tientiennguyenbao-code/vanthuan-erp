'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, Toi } from '@/lib/api';

/** Thanh trên cùng: tên người dùng, các mục được phép xem, nút đăng xuất. */
export function KhungTrang({ toi, children }: { toi: Toi; children: React.ReactNode }) {
  const router = useRouter();
  const coQuyen = (q: string) => toi.quyen.includes(q);
  async function dangXuat() {
    await api('/auth/dang-xuat', { method: 'POST' }).catch(() => undefined);
    router.replace('/dang-nhap');
  }
  return (
    <>
      <header className="thanh-tren">
        <nav>
          <Link href="/"><strong>Vạn Thuận ERP</strong></Link>
          {(coQuyen('HOP_DONG_XEM_TAT_CA') || coQuyen('HOP_DONG_SOAN_CUA_MINH')) && <Link href="/bao-gia">Báo giá</Link>}
          {(coQuyen('HOP_DONG_XEM_TAT_CA') || coQuyen('HOP_DONG_SOAN_CUA_MINH')) && <Link href="/hop-dong">Hợp đồng</Link>}
          {(coQuyen('LO_HANG_XEM_TAT_CA') || coQuyen('LO_HANG_QUAN_LY_CUA_MINH')) && <Link href="/lo-hang">Lô hàng</Link>}
          {(coQuyen('QUYET_TOAN_LAP') || coQuyen('QUYET_TOAN_DUYET') || coQuyen('QUYET_TOAN_DUYET_GD')) && <Link href="/quyet-toan">Quyết toán</Link>}
          {coQuyen('NGUON_CUNG_XEM') && <Link href="/nguon-cung">Nguồn cung</Link>}
          {coQuyen('DOI_TAC_XEM') && <Link href="/doi-tac">Đối tác</Link>}
          {coQuyen('DOI_TAC_XEM') && <Link href="/danh-muc">Danh mục</Link>}
          {coQuyen('TAI_KHOAN_QUAN_LY') && <Link href="/quan-tri/nguoi-dung">Tài khoản</Link>}
          {coQuyen('NHAT_KY_XEM') && <Link href="/nhat-ky">Nhật ký</Link>}
          {toi.vaiTro.some((v) => v.ma === 'NHA_CUNG_CAP') && <Link href="/cong">Lô hàng của tôi</Link>}
          {toi.vaiTro.some((v) => v.ma === 'NHA_CUNG_CAP') && <Link href="/cong/vung-trong">Vùng trồng</Link>}
        </nav>
        <div>
          <span className="phu">{toi.hoTen}</span>{' '}
          <button className="phu-btn nho" onClick={dangXuat}>Đăng xuất</button>
        </div>
      </header>
      <main className="trang">{children}</main>
    </>
  );
}
