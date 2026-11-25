'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError, Toi, trangTheoBuoc } from './api';

/** Lấy người đang đăng nhập; chưa đăng nhập hoặc chưa xong các bước thì chuyển trang phù hợp. */
export function useToi(): Toi | null {
  const router = useRouter();
  const [toi, setToi] = useState<Toi | null>(null);
  useEffect(() => {
    api<Toi>('/auth/toi')
      .then((t) => {
        if (t.buoc !== 'day_du') router.replace(trangTheoBuoc(t.buoc));
        else setToi(t);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) router.replace('/dang-nhap');
      });
  }, [router]);
  return toi;
}
