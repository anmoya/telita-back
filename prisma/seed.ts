import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const defaultPasswordHash = await bcrypt.hash("dev_only_change_me", 12);
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
      passwordHash: defaultPasswordHash
    },
    update: { passwordHash: defaultPasswordHash }
  });

  await prisma.appUser.upsert({
    where: { email: "operador@telita.local" },
    create: {
      branchId: branch.id,
      email: "operador@telita.local",
      fullName: "Operador",
      role: UserRole.operador,
      passwordHash: defaultPasswordHash
    },
    update: {
      branchId: branch.id,
      fullName: "Operador",
      role: UserRole.operador,
      passwordHash: defaultPasswordHash
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

  await prisma.customer.upsert({
    where: {
      branchId_code: {
        branchId: branch.id,
        code: "CLI-1"
      }
    },
    create: {
      branchId: branch.id,
      code: "CLI-1",
      fullName: "Cliente Demo",
      phone: "+56911111111",
      email: "cliente.demo@telita.local",
      companyOrReference: "Living Demo",
      preferredPriceListId: priceList.id,
      discountCode: "CLIENTE10",
      discountPct: 10,
      notes: "Cliente de referencia para pruebas",
      isActive: true
    },
    update: {
      fullName: "Cliente Demo",
      phone: "+56911111111",
      email: "cliente.demo@telita.local",
      companyOrReference: "Living Demo",
      preferredPriceListId: priceList.id,
      discountCode: "CLIENTE10",
      discountPct: 10,
      notes: "Cliente de referencia para pruebas",
      isActive: true
    }
  });

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

  await prisma.systemSetting.upsert({
    where: { key: "global_scrap_threshold_m2" },
    create: {
      key: "global_scrap_threshold_m2",
      valueJson: 0.75,
      updatedBy: user.id,
      updatedAt: new Date()
    },
    update: {
      valueJson: 0.75,
      updatedBy: user.id,
      updatedAt: new Date()
    }
  });

  await prisma.systemSetting.upsert({
    where: { key: "scrap_policy" },
    create: {
      key: "scrap_policy",
      valueJson: {
        classificationRule: {
          version: 1,
          kind: "predicate",
          expression: {
            op: "gte",
            left: { var: "scrap_width_cm" },
            right: { const: 50 }
          }
        },
        locationPolicy: "AT_CUT_REQUIRE_LOCATION"
      },
      updatedBy: user.id,
      updatedAt: new Date()
    },
    update: {
      valueJson: {
        classificationRule: {
          version: 1,
          kind: "predicate",
          expression: {
            op: "gte",
            left: { var: "scrap_width_cm" },
            right: { const: 50 }
          }
        },
        locationPolicy: "AT_CUT_REQUIRE_LOCATION"
      },
      updatedBy: user.id,
      updatedAt: new Date()
    }
  });

  // Seed status labels (Spec-23)
  const statusLabelsData = [
    // Sale statuses
    { entityType: "sale", statusCode: "DRAFT", labelEs: "Borrador", descriptionEs: "Cotización en preparación, aún no confirmada ni enviada al taller." },
    { entityType: "sale", statusCode: "CONFIRMED", labelEs: "Confirmada", descriptionEs: "Venta confirmada. Se han generado los trabajos de corte." },
    { entityType: "sale", statusCode: "CANCELED", labelEs: "Anulada", descriptionEs: "Venta cancelada. No genera corte ni movimiento de stock." },
    // CutJob statuses
    { entityType: "cut_job", statusCode: "PENDING", labelEs: "Pendiente", descriptionEs: "El corte fue programado y está en espera de ejecución." },
    { entityType: "cut_job", statusCode: "IN_PROGRESS", labelEs: "En progreso", descriptionEs: "El corte está siendo ejecutado por el operador." },
    { entityType: "cut_job", statusCode: "CUT", labelEs: "Cortado", descriptionEs: "El corte fue ejecutado. Se puede haber generado un retazo." },
    { entityType: "cut_job", statusCode: "DELIVERED", labelEs: "Entregado", descriptionEs: "El corte fue entregado al cliente o despachado." },
    // Scrap statuses
    { entityType: "scrap", statusCode: "PENDING_CLASSIFICATION", labelEs: "Por clasificar", descriptionEs: "Retazo generado, aún no determinado si es útil o descarte." },
    { entityType: "scrap", statusCode: "DISCARDED", labelEs: "Descartado", descriptionEs: "Retazo pequeño, no apto para reutilización." },
    { entityType: "scrap", statusCode: "PENDING_STORAGE", labelEs: "Por almacenar", descriptionEs: "Estado legado para retazo útil sin ubicación asignada." },
    { entityType: "scrap", statusCode: "PENDING_INBOUND", labelEs: "Pendiente ingreso", descriptionEs: "Retazo útil pendiente de ingreso o ubicación final." },
    { entityType: "scrap", statusCode: "STORED", labelEs: "Almacenado", descriptionEs: "Retazo disponible para uso en una venta futura." },
    { entityType: "scrap", statusCode: "USED", labelEs: "Utilizado", descriptionEs: "Retazo consumido en una venta." }
  ];

  for (const label of statusLabelsData) {
    await prisma.statusLabel.upsert({
      where: { entityType_statusCode: { entityType: label.entityType, statusCode: label.statusCode } },
      create: label,
      update: label
    });
  }

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
