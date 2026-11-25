import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** Kiểm tra dữ liệu gửi lên; sai thì trả lỗi 400 kèm lý do bằng tiếng Việt. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new BadRequestException({
      message: 'Dữ liệu không hợp lệ',
      loi: r.error.issues.map((i) => ({ truong: i.path.join('.'), lyDo: i.message })),
    });
  }
  return r.data;
}
