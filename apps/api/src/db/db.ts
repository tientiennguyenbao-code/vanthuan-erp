import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
/** Một kết nối thường hoặc một giao dịch (transaction) đang mở. */
export type DbExecutor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export const DB = Symbol('DB');
export const PG_POOL = Symbol('PG_POOL');

export function createPool(url: string): Pool {
  return new Pool({ connectionString: url, max: 10 });
}

export function createDb(pool: Pool): Db {
  return drizzle(pool, { schema });
}
