import { Injectable } from "@nestjs/common";
import { PrismaClient, Branch } from "@prisma/client";

@Injectable()
export class PrismaBranchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<Branch[]> {
    return this.prisma.branch.findMany({
      orderBy: { name: "asc" }
    });
  }

  async findByCode(code: string): Promise<Branch | null> {
    return this.prisma.branch.findUnique({
      where: { code }
    });
  }
}
