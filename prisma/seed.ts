import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const brand = await prisma.brand.upsert({
    where: { name: "Default Brand" },
    create: { name: "Default Brand" },
    update: {}
  });

  const branch = await prisma.branch.upsert({
    where: { code: "MAIN" },
    create: {
      brandId: brand.id,
      code: "MAIN",
      name: "Sucursal Principal"
    },
    update: {}
  });

  const user = await prisma.appUser.upsert({
    where: { email: "admin@telita.local" },
    create: {
      branchId: branch.id,
      email: "admin@telita.local",
      fullName: "Administrador",
      role: UserRole.superadmin,
      passwordHash: "dev_only_change_me"
    },
    update: {}
  });

  await prisma.appUser.upsert({
    where: { email: "operador@telita.local" },
    create: {
      branchId: branch.id,
      email: "operador@telita.local",
      fullName: "Operador",
      role: UserRole.operador,
      passwordHash: "dev_only_change_me"
    },
    update: {
      branchId: branch.id,
      fullName: "Operador",
      role: UserRole.operador
    }
  });

  await prisma.unitLength.upsert({
    where: { code: "mm" },
    create: { code: "mm", name: "Milimetro", toMeterFactor: 0.001 },
    update: { name: "Milimetro", toMeterFactor: 0.001 }
  });

  await prisma.unitLength.upsert({
    where: { code: "cm" },
    create: { code: "cm", name: "Centimetro", toMeterFactor: 0.01 },
    update: { name: "Centimetro", toMeterFactor: 0.01 }
  });

  await prisma.unitLength.upsert({
    where: { code: "m" },
    create: { code: "m", name: "Metro", toMeterFactor: 1 },
    update: { name: "Metro", toMeterFactor: 1 }
  });

  await prisma.unitWeight.upsert({
    where: { code: "g" },
    create: { code: "g", name: "Gramo", toKgFactor: 0.001 },
    update: { name: "Gramo", toKgFactor: 0.001 }
  });

  await prisma.unitWeight.upsert({
    where: { code: "kg" },
    create: { code: "kg", name: "Kilogramo", toKgFactor: 1 },
    update: { name: "Kilogramo", toKgFactor: 1 }
  });

  const meterUnit = await prisma.unitLength.findUniqueOrThrow({
    where: { code: "m" },
    select: { id: true }
  });
  const mmUnit = await prisma.unitLength.findUniqueOrThrow({
    where: { code: "mm" },
    select: { id: true }
  });
  const kgUnit = await prisma.unitWeight.findUniqueOrThrow({
    where: { code: "kg" },
    select: { id: true }
  });

  await prisma.currency.upsert({
    where: { code: "CLP" },
    create: { code: "CLP", name: "Peso Chileno", isActive: true },
    update: { name: "Peso Chileno", isActive: true }
  });

  await prisma.tax.upsert({
    where: { code: "IVA" },
    create: {
      code: "IVA",
      name: "Impuesto al Valor Agregado",
      ratePct: 19,
      isMandatory: true,
      isActive: true
    },
    update: {
      name: "Impuesto al Valor Agregado",
      ratePct: 19,
      isMandatory: true,
      isActive: true
    }
  });

  const sku = await prisma.fabricSku.upsert({
    where: {
      branchId_code: {
        branchId: branch.id,
        code: "BLACKOUT_3X5"
      }
    },
    create: {
      branchId: branch.id,
      code: "BLACKOUT_3X5",
      name: "Blackout 3x5",
      description: "SKU de ejemplo para cotizacion",
      lengthValue: 5,
      lengthUnitId: meterUnit.id,
      widthValue: 3,
      widthUnitId: meterUnit.id,
      thicknessValue: 1,
      thicknessUnitId: mmUnit.id,
      weightValue: 1,
      weightUnitId: kgUnit.id,
      isActive: true
    },
    update: {
      name: "Blackout 3x5",
      description: "SKU de ejemplo para cotizacion",
      lengthValue: 5,
      lengthUnitId: meterUnit.id,
      widthValue: 3,
      widthUnitId: meterUnit.id,
      thicknessValue: 1,
      thicknessUnitId: mmUnit.id,
      weightValue: 1,
      weightUnitId: kgUnit.id,
      isActive: true
    }
  });

  await prisma.fabricSku.upsert({
    where: {
      branchId_code: {
        branchId: branch.id,
        code: "BLACKOUT_1X2"
      }
    },
    create: {
      branchId: branch.id,
      code: "BLACKOUT_1X2",
      name: "Blackout 1x2",
      description: "SKU minimo de referencia para umbral global de retazos",
      lengthValue: 2,
      lengthUnitId: meterUnit.id,
      widthValue: 1,
      widthUnitId: meterUnit.id,
      thicknessValue: 1,
      thicknessUnitId: mmUnit.id,
      weightValue: 1,
      weightUnitId: kgUnit.id,
      isActive: true
    },
    update: {
      name: "Blackout 1x2",
      description: "SKU minimo de referencia para umbral global de retazos",
      lengthValue: 2,
      lengthUnitId: meterUnit.id,
      widthValue: 1,
      widthUnitId: meterUnit.id,
      thicknessValue: 1,
      thicknessUnitId: mmUnit.id,
      weightValue: 1,
      weightUnitId: kgUnit.id,
      isActive: true
    }
  });

  let priceList = await prisma.priceList.findFirst({
    where: {
      branchId: branch.id,
      name: "LISTA_BASE",
      isActive: true
    }
  });
  if (!priceList) {
    priceList = await prisma.priceList.create({
      data: {
        branchId: branch.id,
        name: "LISTA_BASE",
        currencyCode: "CLP",
        validFrom: new Date("2026-01-01"),
        isActive: true
      }
    });
  }

  await prisma.priceListItem.upsert({
    where: {
      priceListId_skuId: {
        priceListId: priceList.id,
        skuId: sku.id
      }
    },
    create: {
      priceListId: priceList.id,
      skuId: sku.id,
      basePrice: 12000,
      discountPct: 0
    },
    update: {
      basePrice: 12000,
      discountPct: 0
    }
  });

  await prisma.systemSetting.upsert({
    where: { key: "default_currency" },
    create: {
      key: "default_currency",
      valueJson: "CLP",
      updatedBy: user.id,
      updatedAt: new Date()
    },
    update: {
      valueJson: "CLP",
      updatedBy: user.id,
      updatedAt: new Date()
    }
  });

  await prisma.systemSetting.upsert({
    where: { key: "pricing_method" },
    create: {
      key: "pricing_method",
      valueJson: "LINEAR_METER",
      updatedBy: user.id,
      updatedAt: new Date()
    },
    update: {
      valueJson: "LINEAR_METER",
      updatedBy: user.id,
      updatedAt: new Date()
    }
  });

  await prisma.systemSetting.upsert({
    where: { key: "scrap_threshold_mode" },
    create: {
      key: "scrap_threshold_mode",
      valueJson: "GLOBAL_REFERENCE_SKU",
      updatedBy: user.id,
      updatedAt: new Date()
    },
    update: {
      valueJson: "GLOBAL_REFERENCE_SKU",
      updatedBy: user.id,
      updatedAt: new Date()
    }
  });

  await prisma.systemSetting.upsert({
    where: { key: "scrap_closure_stage" },
    create: {
      key: "scrap_closure_stage",
      valueJson: "AT_SALE_CLOSE",
      updatedBy: user.id,
      updatedAt: new Date()
    },
    update: {
      valueJson: "AT_SALE_CLOSE",
      updatedBy: user.id,
      updatedAt: new Date()
    }
  });

  await prisma.systemSetting.upsert({
    where: { key: "clp_cash_rounding" },
    create: {
      key: "clp_cash_rounding",
      valueJson: "TO_NEAREST_10_WITH_5_DOWN",
      updatedBy: user.id,
      updatedAt: new Date()
    },
    update: {
      valueJson: "TO_NEAREST_10_WITH_5_DOWN",
      updatedBy: user.id,
      updatedAt: new Date()
    }
  });

  console.log("Seed completado");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
