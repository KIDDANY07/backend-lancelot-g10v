export const RULE_LABELS_ES: Record<string, string> = {
  acwr_sostenido: 'ACWR alto sostenido',
  rpe_alto_sostenido: 'RPE alto repetido',
  recaida: 'Riesgo de recaída tras una lesión',
  prediccion_ml: 'Predicción del modelo de ML',
}

export function ruleLabel(rule: string): string {
  return RULE_LABELS_ES[rule] ?? rule
}
