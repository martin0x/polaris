/** Parse user price input ("123", "12.5", "1,234.50") to integer centavos.
 *  Returns null for anything that isn't a non-negative peso amount with at
 *  most two decimals. Money is never a float anywhere in this system. */
export function parsePesoInput(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return parseInt(whole, 10) * 100 + (frac ? parseInt(frac.padEnd(2, "0"), 10) : 0);
}

export function formatCentavos(centavos: number): string {
  return (
    "₱" +
    (centavos / 100).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
