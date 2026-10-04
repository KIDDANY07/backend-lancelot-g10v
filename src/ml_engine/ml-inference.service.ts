import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { extractErrorMessage } from 'src/common/utils/error-message.util'
import {
  InjuryRiskAssessment,
  InjuryRiskAssessmentMethod,
  InjuryRiskLevel,
  InjuryRiskRuleCode,
} from 'src/injury_risk_assessments/entities/injury-risk-assessment.entity'
import { MlInjuryRiskPredictor } from 'src/injury_risk_assessments/predictors/ml-injury-risk.predictor'
import { buildMlFeaturePayload } from 'src/injury_risk_assessments/predictors/ml-features-payload'
import {
  AthleteDailyFeatures,
  FEATURE_VERSION,
} from 'src/ml_features/entities/athlete-daily-features.entity'
import { InjuryRiskPrediction } from './entities/injury-risk-prediction.entity'
import { MlEngineMode } from './entities/ml-engine-config.entity'
import { MlEngineConfigService } from './ml-engine-config.service'
import { MlGovernanceRulesService } from './ml-governance-rules.service'
import { MlModelsService } from './ml-models.service'

const MAX_CONSECUTIVE_FAILURES = 5

export interface InferenceSummary {
  engine: MlEngineMode
  predicted: number
  assessments_created: number
  failed: number
  skipped_reason?: string
}

@Injectable()
export class MlInferenceService {
  private readonly logger = new Logger(MlInferenceService.name)

  constructor(
    @InjectRepository(AthleteDailyFeatures)
    private readonly featuresRepository: Repository<AthleteDailyFeatures>,
    @InjectRepository(InjuryRiskPrediction)
    private readonly predictionsRepository: Repository<InjuryRiskPrediction>,
    @InjectRepository(InjuryRiskAssessment)
    private readonly assessmentsRepository: Repository<InjuryRiskAssessment>,
    private readonly mlEngineConfigService: MlEngineConfigService,
    private readonly mlModelsService: MlModelsService,
    private readonly mlGovernanceRulesService: MlGovernanceRulesService,
    private readonly mlInjuryRiskPredictor: MlInjuryRiskPredictor,
  ) {}

  async runForDate(date: string): Promise<InferenceSummary> {
    const config = await this.mlEngineConfigService.getActive()
    const summary: InferenceSummary = {
      engine: config.engine,
      predicted: 0,
      assessments_created: 0,
      failed: 0,
    }
    const behavior = this.mlGovernanceRulesService.engineBehavior(config.engine)
    if (!behavior.runMl) {
      summary.skipped_reason = 'Motor en modo rules'
      return summary
    }

    const model = await this.mlModelsService.findActiveEntity()
    if (!model) {
      summary.skipped_reason = 'No hay un modelo de ML activo'
      this.logger.warn(
        `Motor en modo ${config.engine} sin modelo activo; se omite el ML`,
      )
      return summary
    }
    if (model.feature_version !== FEATURE_VERSION) {
      summary.skipped_reason = `El modelo activo usa variables ${model.feature_version} y el snapshot genera ${FEATURE_VERSION}`
      this.logger.warn(summary.skipped_reason)
      return summary
    }

    const rows = await this.featuresRepository.find({
      where: { date, is_available: true, feature_version: FEATURE_VERSION },
    })
    const thresholds = {
      prob_medium_threshold: Number(config.prob_medium_threshold),
      prob_high_threshold: Number(config.prob_high_threshold),
    }

    let consecutiveFailures = 0
    for (const row of rows) {
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        summary.skipped_reason = `Se detuvo tras ${MAX_CONSECUTIVE_FAILURES} fallos seguidos del servicio de ML`
        this.logger.error(summary.skipped_reason)
        break
      }
      try {
        const result = await this.mlInjuryRiskPredictor.predict({
          features: buildMlFeaturePayload(
            row as unknown as Record<string, unknown>,
            model.features,
          ),
          model: { id_model: model.id_model, version: model.version },
          thresholds,
        })
        if (!result || result.probability === undefined) {
          summary.failed++
          consecutiveFailures++
          continue
        }
        consecutiveFailures = 0

        if (behavior.persistPredictions) {
          await this.predictionsRepository.upsert(
            {
              id_user: row.id_user,
              date,
              id_model: model.id_model,
              probability: result.probability,
              risk_level: result.riskLevel,
              top_factors: result.top_factors ?? [],
              rules_risk_level: row.rules_risk_level ?? null,
              engine_mode: config.engine,
            },
            ['id_user', 'date'],
          )
          summary.predicted++
        }

        if (
          behavior.createMlAssessments &&
          (result.riskLevel === InjuryRiskLevel.MEDIO ||
            result.riskLevel === InjuryRiskLevel.ALTO)
        ) {
          const exists = await this.assessmentsRepository.findOne({
            where: {
              id_user: row.id_user,
              assessment_date: date,
              method: InjuryRiskAssessmentMethod.ML_MODEL,
            },
          })
          if (!exists) {
            await this.assessmentsRepository.save({
              id_user: row.id_user,
              assessment_date: date,
              method: InjuryRiskAssessmentMethod.ML_MODEL,
              risk_level: result.riskLevel,
              triggered_rules: [InjuryRiskRuleCode.ML_PREDICTION],
              details: [
                `Probabilidad estimada por el modelo ${model.version}: ${(result.probability * 100).toFixed(1)}%`,
                ...result.factors,
              ].join('; '),
              acwr_value: row.acwr ?? null,
            })
            summary.assessments_created++
          }
        }
      } catch (error) {
        summary.failed++
        this.logger.error(
          `Error en la predicción de ML del deportista ${row.id_user}: ${extractErrorMessage(error)}`,
        )
      }
    }
    return summary
  }
}
