import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { todayKey } from 'src/common/utils/date.util'
import { extractErrorMessage } from 'src/common/utils/error-message.util'
import { MlInferenceService } from 'src/ml_engine/ml-inference.service'
import { MlFeaturesService } from './ml-features.service'

@Injectable()
export class MlFeaturesCronService {
  private readonly logger = new Logger(MlFeaturesCronService.name)

  constructor(
    private readonly mlFeaturesService: MlFeaturesService,
    private readonly mlInferenceService: MlInferenceService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async runDailyFeaturePipeline() {
    const today = todayKey()

    try {
      const snapshot = await this.mlFeaturesService.buildSnapshots(today, today)
      this.logger.log(
        `Snapshot de variables del ${today}: ${snapshot.snapshots} deportistas, ${snapshot.failed.length} con error`,
      )
    } catch (error) {
      this.logger.error(
        `Error al generar el snapshot diario de variables: ${extractErrorMessage(error)}`,
      )
    }

    try {
      const inference = await this.mlInferenceService.runForDate(today)
      this.logger.log(
        inference.skipped_reason && inference.predicted === 0
          ? `ML (${inference.engine}) omitido: ${inference.skipped_reason}`
          : `ML (${inference.engine}): ${inference.predicted} predicciones, ${inference.assessments_created} evaluaciones creadas, ${inference.failed} fallos`,
      )
    } catch (error) {
      this.logger.error(
        `Error en la predicción diaria de ML: ${extractErrorMessage(error)}`,
      )
    }

    try {
      const labels = await this.mlFeaturesService.labelRows({
        onlyUnlabeled: true,
      })
      this.logger.log(
        `Etiquetado retroactivo: ${labels.processed} snapshots (${labels.labeled_positive} positivos, ${labels.unknown_mechanism} con mecanismo desconocido)`,
      )
    } catch (error) {
      this.logger.error(
        `Error en el etiquetado retroactivo: ${extractErrorMessage(error)}`,
      )
    }
  }
}
