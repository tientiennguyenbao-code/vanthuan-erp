import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LotsModule } from '../lots/lots.module';
import { IssueController } from './issue.controller';
import { IssueService } from './issue.service';
import { ProcessingController } from './processing.controller';
import { ProcessingService } from './processing.service';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';

@Module({
  imports: [AuditModule, LotsModule],
  controllers: [IssueController, ProcessingController, WarehouseController],
  providers: [WarehouseService, ProcessingService, IssueService],
})
export class WarehouseModule {}
