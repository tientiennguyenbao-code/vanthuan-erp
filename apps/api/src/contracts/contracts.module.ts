import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ContractsController, LedgerController, SignAuthorizationsController, VerifyController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { LedgerService } from './ledger.service';
import { ANCHOR_PROVIDER, InternalAnchorProvider, InternalSignatureProvider, SIGNATURE_PROVIDER } from './providers';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [ContractsController, SignAuthorizationsController, LedgerController, VerifyController],
  providers: [
    ContractsService,
    LedgerService,
    { provide: SIGNATURE_PROVIDER, useClass: InternalSignatureProvider },
    { provide: ANCHOR_PROVIDER, useClass: InternalAnchorProvider },
  ],
})
export class ContractsModule {}
