import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaClient) {}

  getLiveStatus() {
    return {
      status: "ok",
      service: "telita-back",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    };
  }

  async getReadinessStatus() {
    try {
      await this.prisma.$queryRawUnsafe("SELECT 1");

      return {
        status: "ok",
        service: "telita-back",
        checks: {
          database: "ok"
        },
        timestamp: new Date().toISOString()
      };
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: "Service Unavailable",
        message: "Database readiness check failed.",
        checks: {
          database: "error"
        },
        timestamp: new Date().toISOString()
      });
    }
  }
}
