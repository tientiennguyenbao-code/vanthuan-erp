import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { createDb, createPool } from './db';

/** Áp dụng các tệp di trú (thay đổi cấu trúc cơ sở dữ liệu) còn thiếu. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = createPool(databaseUrl);
  try {
    await migrate(createDb(pool), { migrationsFolder: path.join(__dirname, '..', '..', 'drizzle') });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Thiếu DATABASE_URL');
    process.exit(1);
  }
  runMigrations(url)
    .then(() => console.log('Đã cập nhật cấu trúc cơ sở dữ liệu.'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
