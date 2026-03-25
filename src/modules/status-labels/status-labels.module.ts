import { Module } from "@nestjs/common";
import { GetStatusLabelsUseCase } from "./application/use-cases/get-status-labels.use-case";
import { StatusLabelsRepositoryPort } from "./application/ports/status-labels.repository.port";
import { PrismaStatusLabelRepository } from "./infrastructure/persistence/prisma/prisma-status-label.repository";
import { StatusLabelsController } from "./presentation/controllers/status-labels.controller";

@Module({
  controllers: [StatusLabelsController],
  providers: [
    GetStatusLabelsUseCase,
    {
      provide: StatusLabelsRepositoryPort,
      useClass: PrismaStatusLabelRepository
    }
  ]
})
export class StatusLabelsModule {}
