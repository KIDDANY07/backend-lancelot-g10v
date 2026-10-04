import { Injectable } from '@nestjs/common'
import { MlEngineMode } from './entities/ml-engine-config.entity'
import { MlModelMetrics } from './entities/ml-model.entity'

export enum ReadinessCriterionCode {
  LABELED_DAYS = 'dias_etiquetados',
  NON_CONTACT_INJURIES = 'lesiones_sin_contacto',
  ATHLETES = 'deportistas',
}

export interface ReadinessStats {
  labeled_days: number
  non_contact_injuries: number
  athletes: number
}

export interface ReadinessMinimums {
  min_labeled_days: number
  min_non_contact_injuries: number
  min_athletes: number
}

export interface ReadinessCriterion {
  code: ReadinessCriterionCode
  descripcion: string
  value: number
  minimum: number
  met: boolean
}

export interface ReadinessResult {
  ready: boolean
  criteria: ReadinessCriterion[]
}

export interface EngineBehavior {
  runMl: boolean
  persistPredictions: boolean
  createMlAssessments: boolean
}

export interface ModelActivationCandidate {
  is_synthetic: boolean
  feature_version: string
  metrics: MlModelMetrics
  rules_baseline_metrics?: MlModelMetrics | null
}

@Injectable()
export class MlGovernanceRulesService {
  evaluateReadiness(
    stats: ReadinessStats,
    minimums: ReadinessMinimums,
  ): ReadinessResult {
    const criteria: ReadinessCriterion[] = [
      {
        code: ReadinessCriterionCode.LABELED_DAYS,
        descripcion:
          'Días distintos con snapshots etiquetados (aprox. una temporada)',
        value: stats.labeled_days,
        minimum: Number(minimums.min_labeled_days),
      },
      {
        code: ReadinessCriterionCode.NON_CONTACT_INJURIES,
        descripcion:
          'Lesiones sin contacto cubiertas por el periodo etiquetado (eventos positivos)',
        value: stats.non_contact_injuries,
        minimum: Number(minimums.min_non_contact_injuries),
      },
      {
        code: ReadinessCriterionCode.ATHLETES,
        descripcion: 'Deportistas distintos con snapshots etiquetados',
        value: stats.athletes,
        minimum: Number(minimums.min_athletes),
      },
    ].map((criterion) => ({
      ...criterion,
      met: criterion.value >= criterion.minimum,
    }))
    return { ready: criteria.every((c) => c.met), criteria }
  }

  engineBehavior(engine: MlEngineMode): EngineBehavior {
    switch (engine) {
      case MlEngineMode.SHADOW:
        return {
          runMl: true,
          persistPredictions: true,
          createMlAssessments: false,
        }
      case MlEngineMode.ML:
        return {
          runMl: true,
          persistPredictions: true,
          createMlAssessments: true,
        }
      default:
        return {
          runMl: false,
          persistPredictions: false,
          createMlAssessments: false,
        }
    }
  }

  checkEngineChange(
    engine: MlEngineMode,
    context: { hasActiveModel: boolean; ready: boolean },
  ): string | null {
    if (engine === MlEngineMode.RULES) return null
    if (!context.hasActiveModel)
      return `No se puede usar el modo ${engine}: no hay un modelo de ML activo`
    if (engine === MlEngineMode.ML && !context.ready)
      return 'No se puede usar el modo ml: no se cumplen los mínimos de datos (readiness). Use el modo shadow mientras se acumulan datos'
    return null
  }

  checkModelActivation(
    model: ModelActivationCandidate,
    context: { ready: boolean; currentFeatureVersion: string },
  ): string[] {
    const reasons: string[] = []
    if (model.is_synthetic)
      reasons.push(
        'El modelo se entrenó con datos sintéticos o insuficientes y nunca puede activarse',
      )
    if (!context.ready)
      reasons.push(
        'No se cumplen los mínimos de datos (readiness) para usar un modelo de ML',
      )
    if (model.feature_version !== context.currentFeatureVersion)
      reasons.push(
        `El modelo usa las variables ${model.feature_version} y el snapshot actual genera ${context.currentFeatureVersion}`,
      )
    const modelPrAuc = model.metrics?.pr_auc
    const rulesPrAuc = model.rules_baseline_metrics?.pr_auc
    if (typeof modelPrAuc !== 'number' || typeof rulesPrAuc !== 'number')
      reasons.push(
        'Faltan las métricas PR-AUC del modelo o de la línea base de reglas para compararlos',
      )
    else if (modelPrAuc <= rulesPrAuc)
      reasons.push(
        `El modelo no supera a las reglas: PR-AUC ${modelPrAuc} frente a ${rulesPrAuc} de la línea base`,
      )
    return reasons
  }
}
