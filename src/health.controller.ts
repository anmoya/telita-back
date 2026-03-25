import { Controller, Get } from "@nestjs/common";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth() {
    return this.healthService.getLiveStatus();
  }

  @Get("live")
  getLive() {
    return this.healthService.getLiveStatus();
  }

  @Get("ready")
  getReady() {
    return this.healthService.getReadinessStatus();
  }
}
