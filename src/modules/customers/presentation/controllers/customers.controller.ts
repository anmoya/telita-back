import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { PrismaCustomersRepository, type CustomerPayload } from "../../infrastructure/persistence/prisma/prisma-customers.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

@Controller("customers")
export class CustomersController {
  private readonly repo = new PrismaCustomersRepository();

  @Get()
  async list(
    @Query("branchCode") branchCode = "MAIN",
    @Query("q") q?: string,
    @Query("isActive") isActive?: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const rows = await this.repo.list({
        branchCode,
        q,
        isActive: isActive === undefined ? undefined : isActive === "true"
      });
      return rows.map(serializeCustomer);
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Get(":id")
  async getById(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const customer = await this.repo.findById(id);
      if (!customer) throw new Error("Cliente no encontrado.");
      return {
        ...serializeCustomer(customer),
        branchCode: customer.branch.code,
        branchName: customer.branch.name
      };
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Post()
  async create(@Body() body: CustomerPayload, @Headers("authorization") authorization?: string) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      return serializeCustomer(await this.repo.create(body, auth.sub));
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() body: Partial<Omit<CustomerPayload, "branchCode">>,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      return serializeCustomer(
        await this.repo.update(id, {
          fullName: body.fullName,
          phone: body.phone,
          email: body.email,
          companyOrReference: body.companyOrReference,
          preferredPriceListName: body.preferredPriceListName,
          discountCode: body.discountCode,
          discountPct: body.discountPct,
          notes: body.notes
        }, auth.sub)
      );
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Patch(":id/status")
  async setStatus(
    @Param("id") id: string,
    @Body() body: { isActive: boolean },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      return serializeCustomer(await this.repo.setStatus(id, body.isActive, auth.sub));
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }
}

function serializeCustomer(customer: {
  id: string;
  code: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  companyOrReference: string | null;
  discountCode: string | null;
  discountPct: { toString(): string } | number;
  notes: string | null;
  isActive: boolean;
  preferredPriceList?: { name: string } | null;
}) {
  return {
    id: customer.id,
    code: customer.code,
    fullName: customer.fullName,
    phone: customer.phone,
    email: customer.email,
    companyOrReference: customer.companyOrReference,
    preferredPriceListName: customer.preferredPriceList?.name ?? null,
    discountCode: customer.discountCode,
    discountPct: Number(customer.discountPct),
    notes: customer.notes,
    isActive: customer.isActive
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
