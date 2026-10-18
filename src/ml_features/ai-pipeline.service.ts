import { ConflictException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { todayKey } from 'src/common/utils/date.util'
import { extractErrorMessage } from 'src/common/utils/error-message.util'
import {
  FatigueAlert,
  FatigueAlertStatus,
} from 'src/fatigue_alerts/entities/fatigue-alert.entity'
import {
  DailyAlertsSummary,
  FatigueAlertsCronService,
} from 'src/fatigue_alerts/fatigue-alerts-cron.service'
import {
  InjuryRiskAssessment,
  InjuryRiskAssessmentStatus,
} from 'src/injury_risk_assessments/entities/injury-risk-assessment.entity'
import { InjuryRiskAssessmentsCronService } from 'src/injury_risk_assessments/injury-risk-assessments-cron.service'
import { MlFeaturesCronService, StepError } from './ml-features-cron.service'

@Injectable()
export class AiPipelineService {
  private readonly logger = new Logger(AiPipelineService.name)
  private running = false

  constructor(
    @InjectRepository(FatigueAlert)
    private readonly fatigueAlertsRepository: Repository<FatigueAlert>,
    @InjectRepository(InjuryRiskAssessment)
    private readonly assessmentsRepository: Repository<InjuryRiskAssessment>,
    private readonly fatigueAlertsCronService: FatigueAlertsCronService,
    private readonly injuryRiskAssessmentsCronService: InjuryRiskAssessmentsCronService,
    private readonly mlFeaturesCronService: MlFeaturesCronService,
  ) {}

  private async alertsStep(
    work: () => Promise<DailyAlertsSummary>,
  ): Promise<DailyAlertsSummary | StepError> {
    try {
      return await work()
    } catch (error) {
      return { error: extractErrorMessage(error) }
    }
  }

  async runNow() {
    if (this.running)
      throw new ConflictException({
        status: 'Error',
        mensaje:
          'El análisis ya se está ejecutando; espera a que termine para volver a lanzarlo',
      })
    this.running = true
    const startedAt = Date.now()
    const date = todayKey()
    try {
      const fatigue = await this.alertsStep(() =>
        this.fatigueAlertsCronService.runForDate(date),
      )
      const risk = await this.alertsStep(() =>
        this.injuryRiskAssessmentsCronService.runForDate(date),
      )
      const pipeline = await this.mlFeaturesCronService.runPipeline(date)
      const [openFatigue, openRisk] = await Promise.all([
        this.fatigueAlertsRepository.count({
          where: { date, status: FatigueAlertStatus.OPEN },
        }),
        this.assessmentsRepository.count({
          where: {
            assessment_date: date,
            status: InjuryRiskAssessmentStatus.OPEN,
          },
        }),
      ])
      const duration_ms = Date.now() - startedAt
      this.logger.log(
        `Análisis inmediato del ${date} en ${duration_ms} ms: ${openFatigue} alertas de fatiga y ${openRisk} evaluaciones de riesgo abiertas`,
      )
      return {
        status: 'Success',
        mensaje: `Análisis del ${date} completado. Abiertas hoy: alertas de fatiga ${openFatigue}, evaluaciones de riesgo ${openRisk}`,
        date,
        duration_ms,
        fatigue_alerts: fatigue,
        risk_assessments: risk,
        ...pipeline,
        open_today: { fatigue_alerts: openFatigue, risk_assessments: openRisk },
      }
    } finally {
      this.running = false
    }
  }
}
