export enum EvaluationDimension {
  TECNICA = 'tecnica',
  TACTICA = 'tactica',
}

export const DIMENSION_LABELS: Record<EvaluationDimension, string> = {
  [EvaluationDimension.TECNICA]: 'técnica',
  [EvaluationDimension.TACTICA]: 'táctica',
}

export const EVALUATION_INDICATORS: Record<EvaluationDimension, string[]> = {
  [EvaluationDimension.TECNICA]: [
    'Control y recepción',
    'Pase corto',
    'Pase largo',
    'Conducción',
    'Regate',
    'Remate',
    'Cabeceo',
    'Protección del balón',
  ],
  [EvaluationDimension.TACTICA]: [
    'Posicionamiento',
    'Desmarque',
    'Marcaje',
    'Presión y recuperación',
    'Coberturas y apoyos',
    'Transiciones',
    'Lectura de juego',
    'Toma de decisiones',
  ],
}

export function indicatorErrorFor(
  dimension: EvaluationDimension,
  indicator: string,
): string | null {
  const indicators = EVALUATION_INDICATORS[dimension]
  if (indicators.includes(indicator)) return null
  return `El indicador "${indicator}" no pertenece a la evaluación ${DIMENSION_LABELS[dimension]}. Usa uno de estos: ${indicators.join(', ')}.`
}
