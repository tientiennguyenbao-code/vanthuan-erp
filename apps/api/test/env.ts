// Biến môi trường cho kiểm thử. Có thể đặt TEST_DATABASE_URL để dùng cơ sở dữ liệu khác.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/vanthuan_test';
process.env.APP_KEY = process.env.APP_KEY ?? Buffer.alloc(32, 7).toString('base64');
process.env.COOKIE_SECURE = 'false';
