const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatNaira(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const rounded = Math.round(value);
  return `₦${rounded.toLocaleString("en-NG")}`;
}

export function formatCompactNaira(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000) {
    return `₦${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `₦${(value / 1_000).toFixed(1)}k`;
  }
  return `₦${Math.round(value)}`;
}

export function formatPercent(value: number | null | undefined, includePlus = true): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const sign = includePlus && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatPeriodLabel(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length < 2) return isoDate;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const monthName = MONTH_LABELS[monthIdx] ?? parts[1];
  return `${monthName} ${year}`;
}

export function getModelLabel(modelType: string): string {
  switch (modelType) {
    case "ridge_seasonal":
      return "Ridge + Seasonal Dummies";
    case "poly_seasonal":
      return "Polynomial + Fourier Harmonics";
    case "holt_winters":
      return "Holt-Winters Multiplicative";
    default:
      return modelType;
  }
}
