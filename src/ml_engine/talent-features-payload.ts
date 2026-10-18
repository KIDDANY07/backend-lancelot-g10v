export const TALENT_ML_FEATURES = [
  'age_years',
  'birth_quarter',
  'years_to_category_max',
  'plays_up',
  'seasons_in_club',
  'cohort_size',
  'index_value',
  'index_percentile',
  'physical_score',
  'technical_score',
  'tactical_score',
  'participation_score',
  'contribution_score',
  'index_delta',
  'injuries_in_season',
  'severe_injury',
] as const

export type TalentFeatureValue = number | boolean | null

export const TALENT_FEATURE_LABELS_ES: Record<string, string> = {
  age_years: 'Edad',
  birth_quarter: 'Trimestre de nacimiento',
  years_to_category_max: 'Años para la edad máxima de su categoría',
  plays_up: 'Ya juega en una categoría superior',
  seasons_in_club: 'Temporadas previas en el club',
  cohort_size: 'Tamaño de su categoría',
  index_value: 'Índice de progreso',
  index_percentile: 'Percentil en su categoría',
  physical_score: 'Dimensión física',
  technical_score: 'Dimensión técnica',
  tactical_score: 'Dimensión táctica',
  participation_score: 'Participación',
  contribution_score: 'Contribución en partidos',
  index_delta: 'Mejora frente a la temporada anterior',
  injuries_in_season: 'Lesiones en la temporada',
  severe_injury: 'Lesión severa en la temporada',
}

export function buildTalentFeaturePayload(
  row: Record<string, unknown>,
  featureNames: string[],
): Record<string, TalentFeatureValue> {
  const allowed = new Set<string>(TALENT_ML_FEATURES)
  const payload: Record<string, TalentFeatureValue> = {}
  for (const name of featureNames) {
    if (!allowed.has(name)) continue
    const value = row[name]
    if (typeof value === 'boolean') payload[name] = value
    else if (value === null || value === undefined || value === '')
      payload[name] = null
    else {
      const parsed = Number(value)
      payload[name] = Number.isFinite(parsed) ? parsed : null
    }
  }
  return payload
}

export function describeTalentFactor(factor: {
  feature: string
  contribution: number
}): string {
  const label = TALENT_FEATURE_LABELS_ES[factor.feature] ?? factor.feature
  const effect = factor.contribution >= 0 ? 'aumenta' : 'reduce'
  const sign = factor.contribution >= 0 ? '+' : ''
  return `${label}: ${effect} la probabilidad de ascenso (${sign}${factor.contribution.toFixed(2)})`
}
