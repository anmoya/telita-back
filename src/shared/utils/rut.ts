/**
 * Chilean RUT (Rol Único Tributario) utilities.
 * Normalize: strip dots, trim, uppercase K.  Result: "12345678-9" or "12345678-K".
 * Validate: modulo-11 check-digit verification.
 */

export function normalizeRut(raw: string): string {
  return raw.replace(/\./g, "").replace(/\s/g, "").toUpperCase().trim();
}

export function validateRut(rut: string): boolean {
  const normalized = normalizeRut(rut);
  const match = /^(\d{1,8})-?([\dK])$/i.exec(normalized);
  if (!match) return false;

  const body = match[1];
  const given = match[2].toUpperCase();

  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }

  const remainder = 11 - (sum % 11);
  const expected = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);

  return given === expected;
}
