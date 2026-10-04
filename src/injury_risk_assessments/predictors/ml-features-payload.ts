import { InjuryRiskLevel } from '../entities/injury-risk-assessment.entity'
import { MlTopFactor } from './injury-risk-predictor.interface'

export const ML_FEATURE_COLUMNS = [
  'age_years',
  'position',
  'id_category',
  'acute_load_7d',
  'chronic_load_28d',
  'acwr',
  'acwr_ewma',
  'monotony_7d',
  'strain_7d',
  'sessions_7d',
  'rpe_avg_7d',
  'match_minutes_7d',
  'high_rpe_sessions_14d',
  'prior_injuries_count',
  'prior_non_contact_injuries_count',
  'days_since_last_injury',
  'is_recovering',
  'rules_risk_level',
] as const

export type MlFeatureValue = number | boolean | string | null

export const ML_FEATURE_LABELS_ES: Record<string, string> = {
  age_years: 'Edad',
  position: 'Posición',
  id_category: 'Categoría',
  acute_load_7d: 'Carga aguda (7 días)',
  chronic_load_28d: 'Carga crónica (28 días)',
  acwr: 'ACWR',
  acwr_ewma: 'ACWR exponencial',
  monotony_7d: 'Monotonía semanal',
  strain_7d: 'Strain semanal',
  sessions_7d: 'Sesiones en 7 días',
  rpe_avg_7d: 'RPE medio (7 días)',
  match_minutes_7d: 'Minutos de partido (7 días)',
  high_rpe_sessions_14d: 'Sesiones de RPE alto (14 días)',
  prior_injuries_count: 'Lesiones previas',
  prior_non_contact_injuries_count: 'Lesiones previas sin contacto',
  days_since_last_injury: 'Días desde la última lesión',
  is_recovering: 'En reintegro tras lesión',
  rules_risk_level: 'Nivel de riesgo por reglas',
}

const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/

export function buildMlFeaturePayload(
  row: Record<string, unknown>,
  featureNames: string[],
): Record<string, MlFeatureValue> {
  const allowed = new Set<string>(ML_FEATURE_COLUMNS)
  const payload: Record<string, MlFeatureValue> = {}
  for (const name of featureNames) {
    if (!allowed.has(name)) continue
    const value = row[name]
    if (value === null || value === undefined) payload[name] = null
    else if (typeof value === 'number' || typeof value === 'boolean')
      payload[name] = value
    else if (typeof value === 'string')
      payload[name] = NUMERIC_TEXT.test(value) ? Number(value) : value
    else payload[name] = null
  }
  return payload
}

export function classifyProbability(
  probability: number,
  thresholds: { prob_medium_threshold: number; prob_high_threshold: number },
): InjuryRiskLevel {
  if (probability >= thresholds.prob_high_threshold) return InjuryRiskLevel.ALTO
  if (probability >= thresholds.prob_medium_threshold)
    return InjuryRiskLevel.MEDIO
  return InjuryRiskLevel.BAJO
}

export function describeFactor(factor: MlTopFactor): string {
  const label = ML_FEATURE_LABELS_ES[factor.feature] ?? factor.feature
  const effect = factor.contribution >= 0 ? 'aumenta' : 'reduce'
  const sign = factor.contribution >= 0 ? '+' : ''
  return `${label}: ${effect} el riesgo (${sign}${factor.contribution.toFixed(2)})`
}
