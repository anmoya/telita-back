import { Module } from "@nestjs/common";
import { CreateCustomerDiscountUseCase } from "./application/use-cases/create-customer-discount.use-case";
import { CreateCustomerUseCase } from "./application/use-cases/create-customer.use-case";
import { DeactivateCustomerDiscountUseCase } from "./application/use-cases/deactivate-customer-discount.use-case";
import { GetCustomerByIdUseCase } from "./application/use-cases/get-customer-by-id.use-case";
import { ListCustomerDiscountsUseCase } from "./application/use-cases/list-customer-discounts.use-case";
import { ListCustomersUseCase } from "./application/use-cases/list-customers.use-case";
import { SetCustomerStatusUseCase } from "./application/use-cases/set-customer-status.use-case";
import { UpdateCustomerDiscountUseCase } from "./application/use-cases/update-customer-discount.use-case";
import { UpdateCustomerUseCase } from "./application/use-cases/update-customer.use-case";
import { PrismaCustomerDiscountsRepository } from "./infrastructure/persistence/prisma/prisma-customer-discounts.repository";
import { PrismaCustomersRepository } from "./infrastructure/persistence/prisma/prisma-customers.repository";
import { CustomersController } from "./presentation/controllers/customers.controller";

@Module({
  controllers: [CustomersController],
  providers: [
    PrismaCustomersRepository,
    PrismaCustomerDiscountsRepository,
    ListCustomersUseCase,
    GetCustomerByIdUseCase,
    CreateCustomerUseCase,
    UpdateCustomerUseCase,
    SetCustomerStatusUseCase,
    ListCustomerDiscountsUseCase,
    CreateCustomerDiscountUseCase,
    UpdateCustomerDiscountUseCase,
    DeactivateCustomerDiscountUseCase
  ]
})
export class CustomersModule {}
