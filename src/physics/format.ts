// Formatação de números para o HUD (locale conforme o idioma).
import { locale } from "./i18n";

export const fmt = (n: number, digits = 1): string => {
  if (!isFinite(n)) return "—";
  return n.toLocaleString(locale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

/** Notação científica curta, ex.: 1,6×10⁻²² */
export const sci = (n: number, digits = 1): string => {
  if (n === 0) return "0";
  if (!isFinite(n)) return "—";
  let exp = Math.floor(Math.log10(Math.abs(n)));
  let mant = Number((n / Math.pow(10, exp)).toFixed(digits));
  // O arredondamento pode levar a mantissa a 10 (ex.: 9,999 → 10,00): normaliza.
  if (Math.abs(mant) >= 10) {
    mant /= 10;
    exp += 1;
  }
  return `${fmt(mant, digits)}×10${toSuperscript(exp)}`;
};

const SUP: Record<string, string> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

const toSuperscript = (n: number): string =>
  String(n)
    .split("")
    .map((c) => SUP[c] ?? c)
    .join("");

/** Escolhe automaticamente entre notação normal e científica. */
export const auto = (n: number, digits = 1): string => {
  const a = Math.abs(n);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return sci(n, digits);
  return fmt(n, digits);
};
