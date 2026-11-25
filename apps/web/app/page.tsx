'use client';

import { useToi } from '@/lib/use-toi';
import { KhungTrang } from './khung-trang';

const PHAN_HE: { ten: string; moTa: string; quyen: string[]; lienKet?: string; trangThai?: string }[] = [
  { ten: 'Giao dịch và đối tác', moTa: 'Hồ sơ đối tác, báo giá, hợp đồng, phí trọn gói', quyen: ['HOP_DONG_XEM_TAT_CA', 'HOP_DONG_SOAN_CUA_MINH', 'DOI_TAC_XEM'], lienKet: '/doi-tac', trangThai: 'Đã có: đối tác, thẩm định, danh mục. Đang xây: báo giá, hợp đồng' },
  { ten: 'Lô hàng', moTa: 'Lô mua, lô xuất, giám định, booking, cảnh báo cut-off', quyen: ['LO_HANG_XEM_TAT_CA', 'LO_HANG_QUAN_LY_CUA_MINH'] },
  { ten: 'Chứng từ', moTa: 'Ma trận 9 cặp, checklist theo lô, duyệt nhiều cấp', quyen: ['CHUNG_TU_XEM_TAT_CA', 'CHUNG_TU_KIEM_TRA'] },
  { ten: 'Phí và kế toán', moTa: 'Đề nghị thu phí, xuất Excel sang MISA AMIS', quyen: ['PHI_XEM_TAT_CA', 'PHI_XEM_CUA_MINH'] },
];

export default function TrangChu() {
  const toi = useToi();
  if (!toi) return null;
  const duocXem = PHAN_HE.filter((p) => p.quyen.some((q) => toi.quyen.includes(q)));
  return (
    <KhungTrang toi={toi}>
      <h1>Xin chào, {toi.hoTen}</h1>
      <p>
        {toi.vaiTro.map((v) => (
          <span className="nhan" key={v.ma}>{v.ten}</span>
        ))}
      </p>
      {duocXem.length > 0 ? (
        <>
          <h2>Phân hệ</h2>
          <div className="luoi">
            {duocXem.map((p) => (
              <div className="o" key={p.ten}>
                {p.lienKet && <a href={p.lienKet} style={{ float: 'right' }}>Mở</a>}
                <strong>{p.ten}</strong>
                <div className="phu">{p.moTa}</div>
                <div className="phu" style={{ marginTop: 8, fontSize: 13 }}>{p.trangThai ?? 'Đang xây dựng'}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="phu">Tài khoản của bạn dùng để quản lý tài khoản người dùng, không xem nội dung nghiệp vụ.</p>
      )}
    </KhungTrang>
  );
}
