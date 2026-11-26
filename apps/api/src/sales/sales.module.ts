import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InquiriesService } from './inquiries.service';
import { InquiriesController, SamplesController } from './sales.controller';
import { SamplesService } from './samples.service';

@Module({
  imports: [AuditModule],
  controllers: [InquiriesController, SamplesController],
  providers: [InquiriesService, SamplesService],
  exports: [InquiriesService],
})
export class SalesModule {}
