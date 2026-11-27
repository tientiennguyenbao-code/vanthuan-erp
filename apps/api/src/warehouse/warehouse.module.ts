import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ProcessingController } from './processing.controller';
import { ProcessingService } from './processing.service';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';

@Module({
  imports: [AuditModule],
  controllers: [ProcessingController, WarehouseController],
  providers: [WarehouseService, ProcessingService],
})
export class WarehouseModule {}
