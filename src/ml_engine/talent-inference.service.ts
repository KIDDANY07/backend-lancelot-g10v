import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { extractErrorMessage } from 'src/common/utils/error-message.util'
import {
  AthleteSeasonFeatures,
  TALENT_FEATURE_VERSION,
} from 'src/ml_features/entities/athlete-season-features.entity'
import {
  TalentFlag,
  TalentFlagSource,
  TalentFlagStatus,
} from 'src/talent_flags/entities/talent-flag.entity'
import { MlEngineMode } from './entities/ml-engine-config.entity'
import { MlModelTask } from './entities/ml-model.entity'
import { TalentPrediction } from './entities/talent-prediction.entity'
import { MlEngineConfigService } from './ml-engine-config.service'
import { MlGovernanceRulesService } from './ml-governance-rules.service'
import { MlModelsService } from './ml-models.service'
import { MlTalentPredictor } from './predictors/ml-talent.predictor'
import {
  buildTalentFeaturePayload,
  describeTalentFactor,
} from './talent-features-payload'

export const TALENT_ML_RULE = 'prediccion_ml'
const MAX_CONSECUTIVE_FAILURES = 5

export interface TalentInferenceSummary {
  engine: MlEngineMode
  predicted: number
  flags_created: number
  flags_updated: number
  flags_removed: number
  failed: number
  skipped_reason?: string
}

@Injectable()
export class TalentInferenceService {
  private readonly logger = new Logger(TalentInferenceService.name)

  constructor(
    @InjectRepository(AthleteSeasonFeatures)
    private readonly seasonFeaturesRepository: Repository<AthleteSeasonFeatures>,
    @InjectRepository(TalentPrediction)
    private readonly predictionsRepository: Repository<TalentPrediction>,
    @InjectRepository(TalentFlag)
    private readonly talentFlagsRepository: Repository<TalentFlag>,
    private readonly mlEngineConfigService: MlEngineConfigService,
    private readonly mlModelsService: MlModelsService,
    private readonly mlGovernanceRulesService: MlGovernanceRulesService,
    private readonly mlTalentPredictor: MlTalentPredictor,
  ) {}

  async runForSeason(id_season: number): Promise<TalentInferenceSummary> {
    const config = await this.mlEngineConfigService.getActive()
    const summary: TalentInferenceSummary = {
      engine: config.talent_engine,
      predicted: 0,
      flags_created: 0,
      flags_updated: 0,
      flags_removed: 0,
      failed: 0,
    }
    const behavior = this.mlGovernanceRulesService.engineBehavior(
      config.talent_engine,
    )
    if (!behavior.runMl) {
      summary.skipped_reason = 'Motor de talento en modo rules'
      return summary
    }

    const model = await this.mlModelsService.findActiveEntity(
      MlModelTask.TALENT,
    )
    if (!model) {
      summary.skipped_reason = 'No hay un modelo de talento activo'
      this.logger.warn(summary.skipped_reason)
      return summary
    }
    if (model.feature_version !== TALENT_FEATURE_VERSION) {
      summary.skipped_reason = `El modelo de talento usa variables ${model.feature_version} y el dataset genera ${TALENT_FEATURE_VERSION}`
      this.logger.warn(summary.skipped_reason)
      return summary
    }

    const [rows, mlFlags] = await Promise.all([
      this.seasonFeaturesRepository.find({
        where: { id_season, feature_version: TALENT_FEATURE_VERSION },
      }),
      this.talentFlagsRepository.find({
        where: { id_season, source: TalentFlagSource.ML },
      }),
    ])
    const flagByUser = new Map(mlFlags.map((flag) => [flag.id_user, flag]))
    const threshold = Number(config.talent_prob_threshold)

    let consecutiveFailures = 0
    for (const row of rows) {
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        summary.skipped_reason = `Se detuvo tras ${MAX_CONSECUTIVE_FAILURES} fallos seguidos del servicio de ML`
        this.logger.error(summary.skipped_reason)
        break
      }
      try {
        const result = await this.mlTalentPredictor.predict({
          features: buildTalentFeaturePayload(
            row as unknown as Record<string, unknown>,
            model.features,
          ),
          model: { id_model: model.id_model, version: model.version },
        })
        if (!result) {
          summary.failed++
          consecutiveFailures++
          continue
        }
        consecutiveFailures = 0

        await this.predictionsRepository.upsert(
          {
            id_user: row.id_user,
            id_season,
            id_model: model.id_model,
            probability: result.probability,
            top_factors: result.top_factors,
            rules_flagged: row.rules_flagged,
            engine_mode: config.talent_engine,
          },
          ['id_user', 'id_season'],
        )
        summary.predicted++

        if (!behavior.createMlAssessments) continue
        const existing = flagByUser.get(row.id_user)
        if (result.probability >= threshold) {
          if (existing && existing.status !== TalentFlagStatus.OPEN) continue
          await this.talentFlagsRepository.save({
            ...(existing ?? {}),
            id_user: row.id_user,
            id_season,
            source: TalentFlagSource.ML,
            status: TalentFlagStatus.OPEN,
            criteria: `Probabilidad de ascenso estimada por el modelo ${model.version}: ${(result.probability * 100).toFixed(1)} %`,
            recommended_action:
              'Revisar con el cuerpo técnico si conviene evaluar su ascenso a la categoría siguiente',
            score: Math.round(result.probability * 10000) / 100,
            triggered_rules: [TALENT_ML_RULE],
            warnings: result.top_factors.map((factor) =>
              describeTalentFactor(factor),
            ),
            created_by: null,
          })
          if (existing) summary.flags_updated++
          else summary.flags_created++
        } else if (existing && existing.status === TalentFlagStatus.OPEN) {
          await this.talentFlagsRepository.remove(existing)
          summary.flags_removed++
        }
      } catch (error) {
        summary.failed++
        this.logger.error(
          `Error en la predicción de talento del deportista ${row.id_user}: ${extractErrorMessage(error)}`,
        )
      }
    }
    return summary
  }
}
