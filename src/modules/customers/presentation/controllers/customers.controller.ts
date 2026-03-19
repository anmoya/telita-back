import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { PrismaCustomersRepository, type CustomerPayload } from "../../infrastructure/persistence/prisma/prisma-customers.repository";
import { PrismaCustomerDiscountsRepository } from "../../infrastructure/persistence/prisma/prisma-customer-discounts.repository";
import { requireAnyRole, requireAuth } from "../../../../shared/presentation/auth";

@Controller("customers")
export class CustomersController {
  private readonly repo = new PrismaCustomersRepository();
  private readonly discountsRepo = new PrismaCustomerDiscountsRepository();

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
      const msg = getErrorMessage(error);
      if (msg.includes("Ya existe un cliente con este RUT")) throw new ConflictException(msg);
      throw new BadRequestException(msg);
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
          rut: body.rut,
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
      const msg = getErrorMessage(error);
      if (msg.includes("Ya existe un cliente con este RUT")) throw new ConflictException(msg);
      throw new BadRequestException(msg);
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

  // --- Customer Discounts ---

  @Get(":id/discounts")
  async listDiscounts(
    @Param("id") id: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin", "operador"]);
    try {
      const rows = await this.discountsRepo.listByCustomer(id);
      return rows.map(serializeDiscount);
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Post(":id/discounts")
  async createDiscount(
    @Param("id") customerId: string,
    @Body() body: {
      discountCode?: string;
      discountPct: number;
      reason?: string;
      validFrom: string;
      validTo?: string;
    },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      const row = await this.discountsRepo.create({
        customerId,
        createdByEmail: auth.email,
        discountCode: body.discountCode,
        discountPct: body.discountPct,
        reason: body.reason,
        validFrom: body.validFrom,
        validTo: body.validTo
      });
      return serializeDiscount(row);
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Put(":id/discounts/:discountId")
  async updateDiscount(
    @Param("id") _customerId: string,
    @Param("discountId") discountId: string,
    @Body() body: {
      discountCode?: string;
      discountPct?: number;
      reason?: string;
      validFrom?: string;
      validTo?: string | null;
    },
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      const row = await this.discountsRepo.update(discountId, body);
      return serializeDiscount(row);
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }

  @Delete(":id/discounts/:discountId")
  async deactivateDiscount(
    @Param("id") _customerId: string,
    @Param("discountId") discountId: string,
    @Headers("authorization") authorization?: string
  ) {
    const auth = requireAuth(authorization);
    requireAnyRole(auth, ["superadmin", "admin"]);
    try {
      await this.discountsRepo.deactivate(discountId);
      return { ok: true };
    } catch (error) {
      throw new BadRequestException(getErrorMessage(error));
    }
  }
}

function serializeCustomer(customer: {
  id: string;
  code: string;
  rut: string | null;
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
    rut: customer.rut,
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

function serializeDiscount(d: {
  id: string;
  customerId: string;
  discountCode: string | null;
  discountPct: { toString(): string } | number;
  reason: string | null;
  validFrom: Date;
  validTo: Date | null;
  isActive: boolean;
  createdAt: Date;
  createdByUser?: { email: string; fullName: string } | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const from = d.validFrom.toISOString().slice(0, 10);
  const to = d.validTo?.toISOString().slice(0, 10) ?? null;

  let status: string;
  if (!d.isActive) {
    status = "DESACTIVADO";
  } else if (from > today) {
    status = "FUTURO";
  } else if (to && to < today) {
    status = "EXPIRADO";
  } else {
    status = "VIGENTE";
  }

  return {
    id: d.id,
    customerId: d.customerId,
    discountCode: d.discountCode,
    discountPct: Number(d.discountPct),
    reason: d.reason,
    validFrom: from,
    validTo: to,
    isActive: d.isActive,
    status,
    createdAt: d.createdAt.toISOString(),
    createdByName: d.createdByUser?.fullName ?? null,
    createdByEmail: d.createdByUser?.email ?? null
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
