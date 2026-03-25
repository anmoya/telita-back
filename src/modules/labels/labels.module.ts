import { Module } from "@nestjs/common";
import { LabelsOperationsService } from "./application/services/labels-operations.service";
import { PrismaLabelsRepository } from "./infrastructure/persistence/prisma/prisma-labels.repository";
import { LabelsController } from "./presentation/controllers/labels.controller";

@Module({
  controllers: [LabelsController],
  providers: [PrismaLabelsRepository, LabelsOperationsService]
})
export class LabelsModule {}
