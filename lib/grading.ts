// CBSE-style nine-point grade bands, by percentage.
const BANDS: [number, string][] = [
  [91, "A1"],
  [81, "A2"],
  [71, "B1"],
  [61, "B2"],
  [51, "C1"],
  [41, "C2"],
  [33, "D"],
  [0, "E"],
];

export function gradeFor(percent: number) {
  return BANDS.find(([min]) => percent >= min)?.[1] ?? "E";
}

export function percent(score: number, max: number) {
  return max > 0 ? Math.round((score / max) * 1000) / 10 : 0;
}

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const PERIODS = Number(process.env.PERIODS_PER_DAY ?? 8);
