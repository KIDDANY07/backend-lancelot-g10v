export function percentage(
  numerator: number,
  denominator: number,
): number | null {
  if (!denominator) return null
  return Math.round((numerator / denominator) * 10000) / 100
}
