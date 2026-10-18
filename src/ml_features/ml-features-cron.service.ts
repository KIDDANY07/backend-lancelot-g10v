import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { CLUB_TIMEZONE, todayKey } from 'src/common/utils/date.util'
import { extractErrorMessage } from 'src/common/utils/error-message.util'
import {
  InferenceSummary,
  MlInferenceService,
} from 'src/ml_engine/ml-inference.service'
import { MlFeaturesService } from './ml-features.service'
import {
  TalentDatasetSummary,
  TalentFeaturesService,
} from './talent-features.service'

export interface StepError {
  error: string
}

export interface FeaturePipelineSummary {
  snapshot: { athletes: number; snapshots: number; failed: number } | StepError
  inference: InferenceSummary | StepError
  labels:
    | { processed: number; labeled_positive: number; unknown_mechanism: number }
    | StepError
  talent_dataset: TalentDatasetSummary | StepError
}

@Injectable()
export class MlFeaturesCronService {
  private readonly logger = new Logger(MlFeaturesCronService.name)

  constructor(
    private readonly mlFeaturesService: MlFeaturesService,
    private readonly mlInferenceService: MlInferenceService,
    private readonly talentFeaturesService: TalentFeaturesService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_5AM, { timeZone: CLUB_TIMEZONE })
  async runDailyFeaturePipeline() {
    await this.runPipeline(todayKey())
  }

  private async step<T>(
    description: string,
    work: () => Promise<T>,
  ): Promise<T | StepError> {
    try {
      return await work()
    } catch (error) {
      const message = extractErrorMessage(error)
      this.logger.error(`Error en ${description}: ${message}`)
      return { error: message }
    }
  }

  async runPipeline(dateKey: string): Promise<FeaturePipelineSummary> {
    const snapshot = await this.step(
      'el snapshot diario de variables',
      async () => {
        const result = await this.mlFeaturesService.buildSnapshots(
          dateKey,
          dateKey,
        )
        this.logger.log(
          `Snapshot de variables del ${dateKey}: ${result.snapshots} deportistas, ${result.failed.length} con error`,
        )
        return {
          athletes: result.athletes,
          snapshots: result.snapshots,
          failed: result.failed.length,
        }
      },
    )

    const inference = await this.step('la predicción de ML', async () => {
      const result = await this.mlInferenceService.runForDate(dateKey)
      this.logger.log(
        result.skipped_reason && result.predicted === 0
          ? `ML (${result.engine}) omitido: ${result.skipped_reason}`
          : `ML (${result.engine}): ${result.predicted} predicciones, ${result.assessments_created} evaluaciones creadas, ${result.failed} fallos`,
      )
      return result
    })

    const labels = await this.step('el etiquetado retroactivo', async () => {
      const result = await this.mlFeaturesService.labelRows({
        onlyUnlabeled: true,
      })
      this.logger.log(
        `Etiquetado retroactivo: ${result.processed} snapshots (${result.labeled_positive} positivos, ${result.unknown_mechanism} con mecanismo desconocido)`,
      )
      return {
        processed: result.processed,
        labeled_positive: result.labeled_positive,
        unknown_mechanism: result.unknown_mechanism,
      }
    })

    const talentDataset = await this.step(
      'la reconstrucción del dataset de talento',
      () => this.talentFeaturesService.rebuild(),
    )

    return {
      snapshot,
      inference,
      labels,
      talent_dataset: talentDataset,
    }
  }
}
