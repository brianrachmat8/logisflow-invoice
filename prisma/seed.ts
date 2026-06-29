import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import { calculateCharge } from "../src/lib/business";

const db = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("LogisFlow123!", 12);
  const admin = await db.user.upsert({
    where: { email: "admin@logisflow.id" },
    update: { passwordHash },
    create: { name: "Admin LogisFlow", email: "admin@logisflow.id", passwordHash, role: "SUPER_ADMIN" },
  });
  await db.user.upsert({
    where: { email: "management@logisflow.id" },
    update: { passwordHash },
    create: { name: "Management Demo", email: "management@logisflow.id", passwordHash, role: "MANAGEMENT" },
  });
  const company = await db.company.upsert({
    where: { id: "company-demo" },
    update: {},
    create: {
      id: "company-demo",
      name: "PT LogisFlow Nusantara",
      address: "Jl. Pelabuhan Raya No. 88, Jakarta Utara",
      npwp: "00.000.000.0-000.000",
      phone: "+62 21 555 0188",
      email: "finance@logisflow.id",
      bankName: "Bank Central Asia",
      bankAccountNumber: "1234567890",
      bankAccountName: "PT LogisFlow Nusantara",
      signerName: "Budi Santoso",
      signerTitle: "Direktur",
    },
  });
  await db.companyBankAccount.upsert({
    where: { id: "bank-demo-bca" },
    update: {
      companyId: company.id,
      bankName: "Bank Central Asia",
      accountNumber: "1234567890",
      accountName: "PT LogisFlow Nusantara",
      isPrimary: true,
      status: "ACTIVE",
    },
    create: {
      id: "bank-demo-bca",
      companyId: company.id,
      bankName: "Bank Central Asia",
      accountNumber: "1234567890",
      accountName: "PT LogisFlow Nusantara",
      isPrimary: true,
      status: "ACTIVE",
    },
  });
  const client = await db.client.upsert({
    where: { code: "ABC" },
    update: {},
    create: {
      code: "ABC", name: "PT ABC Logistics", address: "Kawasan Industri Marunda, Jakarta Utara",
      email: "ap@abclogistics.co.id", picName: "Andi", paymentTermDays: 30,
    },
  });
  const carrier = await db.carrier.upsert({ where: { code: "ONE" }, update: {}, create: { code: "ONE", name: "Ocean Network Express" } });
  const team = await db.fieldTeam.upsert({ where: { name: "Team One" }, update: {}, create: { name: "Team One", picName: "Rizky", phone: "081234567890" } });
  for (const data of [
    { code: "CMA", name: "CMA CGM" }, { code: "MAEU", name: "Maersk" }, { code: "EGLV", name: "Evergreen" },
  ]) await db.carrier.upsert({ where: { code: data.code }, update: {}, create: data });

  await db.taxRate.updateMany({ data: { active: false } });
  await db.taxRate.create({
    data: { name: "PPN Demo", rate: new Prisma.Decimal(11), effectiveDate: new Date("2026-01-01"), active: true },
  });

  const existing = await db.shipment.findUnique({ where: { jobNumber: "JOB/2026/06/0001" } });
  if (!existing) {
    const shipment = await db.shipment.create({
      data: {
        jobNumber: "JOB/2026/06/0001",
        clientId: client.id,
        carrierId: carrier.id,
        vessel: "MV Container Star",
        voyage: "001A",
        shipmentDirection: "EXPORT",
        doNumber: "JKTG26534800",
        shipmentDate: new Date("2026-06-24"),
        fieldTeamId: team.id,
        internalPic: "Admin LogisFlow",
        status: "READY_TO_GENERATE",
        createdById: admin.id,
      },
    });
    const bills = [];
    for (const number of ["BL001", "BL002", "BL003"]) {
      bills.push(await db.billOfLading.create({ data: { shipmentId: shipment.id, number } }));
    }
    const prefixes = ["ONEU12345", "TCLU76543", "SEKU11223"];
    const quantities = [5, 4, 6];
    for (let b = 0; b < bills.length; b++) {
      for (let i = 0; i < quantities[b]; i++) {
        await db.container.create({
          data: {
            shipmentId: shipment.id, billId: bills[b].id,
            number: `${prefixes[b]}${String(i + 10).padStart(2, "0")}`.slice(0, 4) + `${1000000 + b * 100 + i}`,
            size: "40HC", type: "HC", fieldTeamId: team.id,
          },
        });
      }
      const calc = calculateCharge({ quantity: quantities[b], unitPrice: 1_100_000, category: "JASA", taxRate: 11 });
      await db.charge.create({
        data: {
          shipmentId: shipment.id, billId: bills[b].id, name: "Jasa Trucking",
          description: `Jasa trucking ${bills[b].number}`, category: "JASA",
          quantity: new Prisma.Decimal(quantities[b]), unitPrice: new Prisma.Decimal(1_100_000),
          subtotal: new Prisma.Decimal(calc.subtotal), taxRate: new Prisma.Decimal(calc.taxRate),
          taxAmount: new Prisma.Decimal(calc.taxAmount), totalAmount: new Prisma.Decimal(calc.totalAmount),
        },
      });
    }
    const reimb = calculateCharge({ quantity: 15, unitPrice: 1_276_500, category: "REIMBURSEMENT", taxRate: 0 });
    await db.charge.create({
      data: {
        shipmentId: shipment.id, name: "Lift Off", description: "Reimbursement lift off 15 kontainer",
        category: "REIMBURSEMENT", quantity: new Prisma.Decimal(15), unitPrice: new Prisma.Decimal(1_276_500),
        subtotal: new Prisma.Decimal(reimb.subtotal), taxRate: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0), totalAmount: new Prisma.Decimal(reimb.totalAmount),
      },
    });
  }
  console.log(`Seed selesai. Login: ${admin.email} / LogisFlow123!`);
  console.log(`Company: ${company.name}; data contoh 3 B/L telah tersedia.`);
}

main().finally(() => db.$disconnect());
