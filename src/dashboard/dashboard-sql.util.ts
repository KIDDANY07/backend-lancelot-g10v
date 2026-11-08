export type Row = Record<string, unknown>

export function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function roundOrNull(value: unknown, decimals: number): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  const factor = 10 ** decimals
  return Math.round(parsed * factor) / factor
}

export function str(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  return JSON.stringify(value)
}

export function fullName(row: Row): string {
  return [row.name, row.lastname].filter(Boolean).join(' ')
}

export function toBool(value: unknown): boolean {
  return value === true || value === 't' || value === 'true'
}
