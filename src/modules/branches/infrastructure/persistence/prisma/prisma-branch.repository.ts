import { Injectable } from "@nestjs/common";
import { PrismaClient, Branch } from "@prisma/client";

const prisma = new PrismaClient();

@Injectable()
export class PrismaBranchRepository {
  async findAll(): Promise<Branch[]> {
    return prisma.branch.findMany({
      orderBy: { name: "asc" }
    });
  }

  async findByCode(code: string): Promise<Branch | null> {
    return prisma.branch.findUnique({
      where: { code }
    });
  }
}
