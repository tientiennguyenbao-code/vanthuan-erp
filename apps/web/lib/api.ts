'use client';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Gọi máy chủ nghiệp vụ; lỗi trả về được đổi thành câu tiếng Việt dễ hiểu. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const loi = Array.isArray(data.loi) ? (data.loi as { lyDo: string }[]).map((l) => l.lyDo).join('; ') : '';
    const msg = loi || (typeof data.message === 'string' ? data.message : 'Có lỗi xảy ra, vui lòng thử lại');
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

export type Buoc = 'cho_ma_2_lop' | 'can_cai_2_lop' | 'phai_doi_mat_khau' | 'day_du';

export interface Toi {
  id: string;
  email: string;
  hoTen: string;
  buoc: Buoc;
  vaiTro: { ma: string; ten: string }[];
  quyen: string[];
}

/** Trang cần mở tiếp theo sau mỗi bước đăng nhập. */
export function trangTheoBuoc(buoc: Buoc): string {
  switch (buoc) {
    case 'cho_ma_2_lop':
      return '/dang-nhap/ma-2-lop';
    case 'can_cai_2_lop':
      return '/dang-nhap/cai-2-lop';
    case 'phai_doi_mat_khau':
      return '/dang-nhap/doi-mat-khau';
    default:
      return '/';
  }
}
