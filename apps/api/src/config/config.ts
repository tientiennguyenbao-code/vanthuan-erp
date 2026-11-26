import { z } from 'zod';

/**
 * Cấu hình đọc từ biến môi trường. Thiếu hoặc sai thì máy chủ dừng ngay khi khởi động,
 * để không chạy với cấu hình nửa vời.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'Thiếu DATABASE_URL'),
  APP_KEY: z
    .string()
    .min(1, 'Thiếu APP_KEY')
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'APP_KEY phải là 32 byte mã hoá base64'),
  PORT: z.coerce.number().int().positive().default(4000),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  TOTP_ISSUER: z.string().default('Van Thuan Global'),
  /** Thư mục lưu tệp chứng từ (đã mã hoá). Khi chạy thật thay bằng kho lưu trữ chuẩn S3 đặt tại Việt Nam. */
  FILE_DIR: z.string().default('./data/tep'),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (!cached) {
    const parsed = schema.safeParse(env);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Cấu hình không hợp lệ: ${msg}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Chỉ dùng trong kiểm thử. */
export function resetConfigCache(): void {
  cached = undefined;
}
