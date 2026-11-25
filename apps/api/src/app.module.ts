import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { ContractsModule } from './contracts/contracts.module';
import { DbModule } from './db/db.module';
import { HealthController } from './health.controller';
import { LotsModule } from './lots/lots.module';
import { PartnersModule } from './partners/partners.module';
import { QuotesModule } from './quotes/quotes.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [DbModule, AuditModule, AuthModule, UsersModule, CatalogModule, PartnersModule, ContractsModule, QuotesModule, LotsModule],
  controllers: [HealthController],
})
export class AppModule {}
