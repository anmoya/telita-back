import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import type { AuthTokenPayload } from "../../../../shared/infrastructure/auth/token.service";
import { Authenticated } from "../../../../shared/presentation/authenticated.decorator";
import { CurrentAuth } from "../../../../shared/presentation/current-auth.decorator";
import { Roles } from "../../../../shared/presentation/roles.decorator";
import { CreateCustomerDiscountUseCase } from "../../application/use-cases/create-customer-discount.use-case";
import { CreateCustomerUseCase } from "../../application/use-cases/create-customer.use-case";
import { DeactivateCustomerDiscountUseCase } from "../../application/use-cases/deactivate-customer-discount.use-case";
import { GetCustomerByIdUseCase } from "../../application/use-cases/get-customer-by-id.use-case";
import { ListCustomerDiscountsUseCase } from "../../application/use-cases/list-customer-discounts.use-case";
import { ListCustomersUseCase } from "../../application/use-cases/list-customers.use-case";
import { SetCustomerStatusUseCase } from "../../application/use-cases/set-customer-status.use-case";
import { UpdateCustomerDiscountUseCase } from "../../application/use-cases/update-customer-discount.use-case";
import { UpdateCustomerUseCase } from "../../application/use-cases/update-customer.use-case";
import type { CustomerPayload } from "../../infrastructure/persistence/prisma/prisma-customers.repository";

@Authenticated("superadmin", "admin", "operador")
@Controller("customers")
export class CustomersController {
  constructor(
    private readonly listCustomersUseCase: ListCustomersUseCase,
    private readonly getCustomerByIdUseCase: GetCustomerByIdUseCase,
    private readonly createCustomerUseCase: CreateCustomerUseCase,
    private readonly updateCustomerUseCase: UpdateCustomerUseCase,
    private readonly setCustomerStatusUseCase: SetCustomerStatusUseCase,
    private readonly listCustomerDiscountsUseCase: ListCustomerDiscountsUseCase,
    private readonly createCustomerDiscountUseCase: CreateCustomerDiscountUseCase,
    private readonly updateCustomerDiscountUseCase: UpdateCustomerDiscountUseCase,
    private readonly deactivateCustomerDiscountUseCase: DeactivateCustomerDiscountUseCase
  ) {}

  @Get()
  async list(
    @Query("branchCode") branchCode = "MAIN",
    @Query("q") q?: string,
    @Query("isActive") isActive?: string
  ) {
    const rows = await this.listCustomersUseCase.execute({
      branchCode,
      q,
      isActive: isActive === undefined ? undefined : isActive === "true"
    });
    return rows.map(serializeCustomer);
  }

  @Get(":id")
  async getById(@Param("id") id: string) {
    const customer = await this.getCustomerByIdUseCase.execute(id);
    return {
      ...serializeCustomer(customer),
      branchCode: customer.branch.code,
      branchName: customer.branch.name
    };
  }

  @Post()
  @Roles("superadmin", "admin")
  async create(@Body() body: CustomerPayload, @CurrentAuth() auth: AuthTokenPayload) {
    return serializeCustomer(await this.createCustomerUseCase.execute(body, auth.sub));
  }

  @Put(":id")
  @Roles("superadmin", "admin")
  async update(
    @Param("id") id: string,
    @Body() body: Partial<Omit<CustomerPayload, "branchCode">>,
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    return serializeCustomer(
      await this.updateCustomerUseCase.execute(id, {
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
  }

  @Patch(":id/status")
  @Roles("superadmin", "admin")
  async setStatus(
    @Param("id") id: string,
    @Body() body: { isActive: boolean },
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    return serializeCustomer(await this.setCustomerStatusUseCase.execute(id, body.isActive, auth.sub));
  }

  // --- Customer Discounts ---

  @Get(":id/discounts")
  async listDiscounts(@Param("id") id: string) {
    const rows = await this.listCustomerDiscountsUseCase.execute(id);
    return rows.map(serializeDiscount);
  }

  @Post(":id/discounts")
  @Roles("superadmin", "admin")
  async createDiscount(
    @Param("id") customerId: string,
    @Body() body: {
      discountCode?: string;
      discountPct: number;
      reason?: string;
      validFrom: string;
      validTo?: string;
    },
    @CurrentAuth() auth: AuthTokenPayload
  ) {
    const row = await this.createCustomerDiscountUseCase.execute({
      customerId,
      createdByEmail: auth.email,
      discountCode: body.discountCode,
      discountPct: body.discountPct,
      reason: body.reason,
      validFrom: body.validFrom,
      validTo: body.validTo
    });
    return serializeDiscount(row);
  }

  @Put(":id/discounts/:discountId")
  @Roles("superadmin", "admin")
  async updateDiscount(
    @Param("id") _customerId: string,
    @Param("discountId") discountId: string,
    @Body() body: {
      discountCode?: string;
      discountPct?: number;
      reason?: string;
      validFrom?: string;
      validTo?: string | null;
    }
  ) {
    const row = await this.updateCustomerDiscountUseCase.execute(discountId, body);
    return serializeDiscount(row);
  }

  @Delete(":id/discounts/:discountId")
  @Roles("superadmin", "admin")
  async deactivateDiscount(
    @Param("id") _customerId: string,
    @Param("discountId") discountId: string
  ) {
    await this.deactivateCustomerDiscountUseCase.execute(discountId);
    return { ok: true };
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
