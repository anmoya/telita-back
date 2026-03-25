import { Module } from "@nestjs/common";
import { ListAuditEntriesUseCase } from "./application/use-cases/list-audit-entries.use-case";
import { AuditController } from "./presentation/controllers/audit.controller";

@Module({
  controllers: [AuditController],
  providers: [ListAuditEntriesUseCase]
})
export class AuditModule {}
