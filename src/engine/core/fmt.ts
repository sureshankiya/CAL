/** Number and dimension formatting used by every calculation sheet. */

export function fmt(v: number, d = 2): string {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Ratio to 3 decimals, the D/C convention used on the Tedds-style sheets. */
export const fmtRatio = (v: number) => fmt(v, 3);

/** Nearest 1/16 in. as a mixed fraction, e.g. 11.875 → 11-7/8. */
export function fmtInFraction(inches: number, denom = 16): string {
  if (!Number.isFinite(inches)) return "—";
  const sign = inches < 0 ? "-" : "";
  const total = Math.round(Math.abs(inches) * denom);
  const whole = Math.floor(total / denom);
  let num = total % denom;
  let den = denom;
  while (num && num % 2 === 0 && den % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  if (!num) return `${sign}${whole}`;
  return whole ? `${sign}${whole}-${num}/${den}` : `${sign}${num}/${den}`;
}

/** Feet to feet-inches text, e.g. 12.5 → 12′-6″. */
export function fmtFtIn(ft: number): string {
  if (!Number.isFinite(ft)) return "—";
  const sign = ft < 0 ? "-" : "";
  let f = Math.floor(Math.abs(ft));
  let inch = (Math.abs(ft) - f) * 12;
  if (inch > 11.97) {
    f += 1;
    inch = 0;
  }
  return `${sign}${f}′-${fmtInFraction(inch)}″`;
}

export const lbToKip = (lb: number) => lb / 1000;
