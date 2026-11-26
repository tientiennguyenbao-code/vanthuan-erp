import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PortalSourcingController, SourcingController } from './sourcing.controller';
import { SourcingService } from './sourcing.service';

@Module({
  imports: [AuditModule],
  controllers: [SourcingController, PortalSourcingController],
  providers: [SourcingService],
  exports: [SourcingService],
})
export class SourcingModule {}
