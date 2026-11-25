'use client';

import { ngayGio } from './nhan';

export const BUOC_LO_XUAT = ['dong_goi', 'nhap_kho', 'giam_dinh', 'dat_cho', 'xep_tau', 'hoan_tat'] as const;

export const TRANG_THAI_LO_XUAT: Record<string, string> = {
  dong_goi: 'Đóng gói, phân bổ',
  nhap_kho: 'Nhập kho',
  giam_dinh: 'Giám định',
  dat_cho: 'Đặt chỗ, đóng cont',
  xep_tau: 'Đã xếp tàu',
  hoan_tat: 'Hoàn tất',
  da_huy: 'Đã huỷ',
};

export const TRANG_THAI_LO_MUA: Record<string, string> = {
  thu_gom: 'Đang thu gom',
  da_so_che: 'Đã sơ chế',
  da_nhap_kho: 'Đã nhập kho',
  da_huy: 'Đã huỷ',
};

export const THI_TRUONG: Record<string, string> = { US: 'Mỹ', EU: 'EU', CN: 'Trung Quốc' };
export const LOAI_GIAO_DICH: Record<string, string> = { mua_dut: 'Mua đứt bán lại', moi_gioi: 'Môi giới' };

export const SU_KIEN_LO: Record<string, string> = {
  tao: 'Tạo lô',
  thu_gom: 'Thu gom',
  so_che: 'Sơ chế',
  nhap_kho: 'Nhập kho',
  huy: 'Huỷ lô',
  dong_y_chia_lo: 'Nhà cung cấp đồng ý chia lô',
  sua: 'Sửa ngày tàu',
  phan_bo: 'Phân bổ',
  duyet_phan_bo: 'Duyệt phân bổ',
  huy_phan_bo: 'Huỷ phân bổ',
  giam_dinh: 'Giám định',
  booking: 'Cập nhật booking',
  chuyen_buoc: 'Chuyển bước',
};

export function kg(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} kg`;
}

export function Den({ mau }: { mau: 'do' | 'vang' | 'xanh' }) {
  const ten = mau === 'do' ? 'Cần xử lý gấp' : mau === 'vang' ? 'Sắp đến hạn' : 'Bình thường';
  return <span className={`den den-${mau}`} role="img" aria-label={ten} title={ten} />;
}

export function CacBuoc({ hienTai }: { hienTai: string }) {
  const i = BUOC_LO_XUAT.indexOf(hienTai as (typeof BUOC_LO_XUAT)[number]);
  return (
    <ol className="buoc" aria-label="Các bước của lô">
      {BUOC_LO_XUAT.map((b, k) => (
        <li key={b} className={k < i ? 'xong' : k === i ? 'hien-tai' : ''} aria-current={k === i ? 'step' : undefined}>
          {TRANG_THAI_LO_XUAT[b]}
        </li>
      ))}
    </ol>
  );
}

export interface SuKienLo {
  id: number;
  at: string;
  kind: string;
  quantityKg: number | null;
  result: string | null;
  note: string | null;
  detail: Record<string, unknown> | null;
  actorName: string;
  facilityName: string | null;
}

export function moTaSuKien(e: SuKienLo): string {
  const d = e.detail ?? {};
  const parts: string[] = [];
  if (e.quantityKg !== null) parts.push(kg(e.quantityKg));
  if (e.kind === 'so_che' && d.haoHutKg !== undefined) parts.push(`hao hụt ${kg(d.haoHutKg as number)} (${d.haoHutPhanTram}%)`);
  if (e.facilityName) parts.push(e.facilityName);
  if (e.kind === 'giam_dinh') parts.push(`${e.result === 'dat' ? 'Đạt' : 'Không đạt'} · ${d.donViGiamDinh}${d.soChungThu ? ` · ${d.soChungThu}` : ''}`);
  if (e.kind === 'booking') parts.push(`${d.hangTau} · ${d.soBooking}${Array.isArray(d.container) ? ` · ${d.container.length} cont` : ''}`);
  if (e.kind === 'chuyen_buoc' && e.note) {
    const [tu, den] = e.note.split(' → ');
    parts.push(`${TRANG_THAI_LO_XUAT[tu] ?? tu} → ${TRANG_THAI_LO_XUAT[den] ?? den}`);
    if (d.soVanDon) parts.push(`vận đơn ${d.soVanDon}, tàu chạy ${d.ngayTauChay}`);
  } else if (e.note) parts.push(e.note);
  return parts.join(' · ');
}

/** Nhật ký lô (chỉ ghi thêm). */
export function NhatKy({ suKien }: { suKien: SuKienLo[] }) {
  return (
    <div className="bang-cuon">
      <table>
        <thead><tr><th>Lúc</th><th>Việc</th><th>Chi tiết</th><th>Người ghi</th></tr></thead>
        <tbody>
          {suKien.map((e) => (
            <tr key={e.id}>
              <td>{ngayGio(e.at)}</td>
              <td>{SU_KIEN_LO[e.kind] ?? e.kind}</td>
              <td>{moTaSuKien(e)}</td>
              <td>{e.actorName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
