import { Client } from 'pg';
import { runMigrations } from '../src/db/migrate';

/** Trước mỗi lượt kiểm thử: xoá sạch cơ sở dữ liệu kiểm thử rồi dựng lại từ các tệp di trú. */
export default async function globalSetup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/vanthuan_test';
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await client.end();
  await runMigrations(url);
}
