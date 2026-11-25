import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { loadConfig } from '../config/config';
import { createDb, createPool, DB, PG_POOL } from './db';

@Global()
@Module({
  providers: [
    { provide: PG_POOL, useFactory: () => createPool(loadConfig().DATABASE_URL) },
    { provide: DB, inject: [PG_POOL], useFactory: (pool: Pool) => createDb(pool) },
  ],
  exports: [DB, PG_POOL],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
