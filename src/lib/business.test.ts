import { describe, expect, it } from "vitest";
import { agingBucket, allocateAdvanceDp, calculateCharge, invoiceDirectionCode, invoiceNumber, previewSplit, terbilang } from "./business";

describe("perhitungan invoice", () => {
  it("menghitung JASA dengan PPN", () => {
    expect(calculateCharge({ quantity: 5, unitPrice: 1_100_000, category: "JASA", taxRate: 11 })).toEqual({
      subtotal: 5_500_000, taxRate: 11, taxAmount: 605_000, totalAmount: 6_105_000,
    });
  });
  it("selalu meniadakan pajak reimbursement", () => {
    expect(calculateCharge({ quantity: 15, unitPrice: 1_276_500, category: "REIMBURSEMENT", taxRate: 11 })).toEqual({
      subtotal: 19_147_500, taxRate: 0, taxAmount: 0, totalAmount: 19_147_500,
    });
  });
  it("memisahkan JASA per B/L dan menggabungkan reimbursement", () => {
    const result = previewSplit([
      { billId: "bl1", billNumber: "BL001", name: "Trucking", category: "JASA", quantity: 5, unitPrice: 1_100_000, taxRate: 11 },
      { billId: "bl2", billNumber: "BL002", name: "Trucking", category: "JASA", quantity: 4, unitPrice: 1_100_000, taxRate: 11 },
      { name: "Lift Off", category: "REIMBURSEMENT", quantity: 9, unitPrice: 1_000_000, taxRate: 0 },
    ]);
    expect(result.jasa).toHaveLength(2);
    expect(result.reimbursement).toHaveLength(1);
    expect(result.reimbursement[0].grandTotal).toBe(9_000_000);
  });
  it("menolak JASA tanpa B/L saat mode split per B/L", () => {
    expect(() => previewSplit([{ name: "Trucking", category: "JASA", quantity: 1, unitPrice: 1, taxRate: 11 }])).toThrow(/B\/L/);
  });
  it("mengizinkan JASA tanpa B/L saat mode gabungan", () => {
    const result = previewSplit([
      { name: "Handling dokumen", category: "JASA", quantity: 1, unitPrice: 500_000, taxRate: 11 },
    ], "combine_jasa");
    expect(result.jasa).toHaveLength(1);
    expect(result.jasa[0].billId).toBeNull();
  });
  it("membagi DP secara proporsional untuk dua invoice", () => {
    expect(allocateAdvanceDp([1_000_000, 3_000_000], 2_000_000)).toEqual([500_000, 1_500_000]);
  });
  it("membuat semua invoice lunas ketika DP sama dengan total tagihan", () => {
    const grandTotals = [1_250_000, 2_750_000];
    expect(allocateAdvanceDp(grandTotals, 4_000_000)).toEqual(grandTotals);
  });
  it("menaruh selisih pembulatan DP ke invoice terakhir", () => {
    expect(allocateAdvanceDp([1, 1, 1], 1)).toEqual([0.33, 0.33, 0.34]);
  });
});

describe("utilitas invoice", () => {
  it("membentuk nomor invoice berbasis kode klien dan jenis order", () => {
    expect(invoiceNumber("LKL/IMP", new Date(2026, 5, 24), 1)).toBe("LKL/IMP/2026/06/0001");
  });
  it("membentuk kode jenis order invoice", () => {
    expect(invoiceDirectionCode("IMPORT")).toBe("IMP");
    expect(invoiceDirectionCode("EXPORT")).toBe("EXP");
    expect(invoiceDirectionCode("LAIN_LAIN")).toBe("DLL");
  });
  it("membuat terbilang bahasa Indonesia", () => {
    expect(terbilang(6_105_000)).toBe("Enam Juta Seratus Lima Ribu Rupiah");
  });
  it("mengelompokkan aging", () => {
    expect(agingBucket(new Date("2026-06-20T00:00:00Z"), new Date("2026-06-26T00:00:00Z")).key).toBe("OVERDUE_1_7");
    expect(agingBucket(new Date("2026-07-01T00:00:00Z"), new Date("2026-06-26T00:00:00Z")).key).toBe("NOT_DUE");
  });
});
