import { Controller, Get } from "@nestjs/common";
import { GetStatusLabelsUseCase } from "../../application/use-cases/get-status-labels.use-case";

@Controller("status-labels")
export class StatusLabelsController {
  constructor(private readonly getStatusLabelsUseCase: GetStatusLabelsUseCase) {}

  @Get()
  async getAll() {
    return this.getStatusLabelsUseCase.execute();
  }
}
