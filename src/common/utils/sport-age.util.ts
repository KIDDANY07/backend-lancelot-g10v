export interface CategoryAgeLimit {
  name: string
  max_age: number | string
}

export interface CategoryEligibility {
  eligible: boolean
  sportingAge: number | null
  reason?: string
}

export function referenceYearOf(startDate?: string | Date | null): number {
  if (!startDate) return new Date().getUTCFullYear()
  const year = Number(
    String(
      startDate instanceof Date ? startDate.toISOString() : startDate,
    ).slice(0, 4),
  )
  return Number.isFinite(year) ? year : new Date().getUTCFullYear()
}

export function sportingAge(
  birthDate: string | null | undefined,
  referenceYear: number,
): number | null {
  if (!birthDate) return null
  const birthYear = Number(String(birthDate).slice(0, 4))
  return Number.isFinite(birthYear) ? referenceYear - birthYear : null
}

export function checkCategoryEligibility(
  birthDate: string | null | undefined,
  category: CategoryAgeLimit,
  referenceYear: number,
): CategoryEligibility {
  const age = sportingAge(birthDate, referenceYear)
  if (age === null)
    return {
      eligible: false,
      sportingAge: null,
      reason:
        'El deportista no tiene fecha de nacimiento registrada; regístrala para validar su categoría',
    }
  const maxAge = Number(category.max_age)
  if (age > maxAge)
    return {
      eligible: false,
      sportingAge: age,
      reason: `El deportista cumple ${age} años en ${referenceYear} y supera el límite de ${category.name} (máximo ${maxAge} años). Puede jugar en categorías de su edad o superiores, no en menores`,
    }
  return { eligible: true, sportingAge: age }
}

export function pickBaseAssignments<
  T extends { id_user: number; id_category: number; id_ath_cat?: number },
>(
  assignments: T[],
  maxAgeOf: (assignment: T) => number,
  keyOf: (assignment: T) => string | number = (assignment) =>
    assignment.id_user,
): Map<string | number, T> {
  const result = new Map<string | number, T>()
  for (const assignment of assignments) {
    const key = keyOf(assignment)
    const current = result.get(key)
    if (
      !current ||
      maxAgeOf(assignment) < maxAgeOf(current) ||
      (maxAgeOf(assignment) === maxAgeOf(current) &&
        (assignment.id_ath_cat ?? 0) < (current.id_ath_cat ?? 0))
    )
      result.set(key, assignment)
  }
  return result
}
