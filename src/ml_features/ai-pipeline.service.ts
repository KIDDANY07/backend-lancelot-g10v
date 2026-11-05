import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { addDaysToKey, daysBetween, todayKey } from 'src/common/utils/date.util'
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
import {
  InferenceSummary,
  MlInferenceService,
} from 'src/ml_engine/ml-inference.service'
import { MlFeaturesCronService, StepError } from './ml-features-cron.service'
import { MAX_RANGE_DAYS } from './ml-features.service'

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
    private readonly mlInferenceService: MlInferenceService,
  ) {}

  private validateHistoryRange(from: string, to: string) {
    if (from > to)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'La fecha inicial no puede ser posterior a la final',
      })
    if (to > todayKey())
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No se puede reconstruir el histórico de fechas futuras',
      })
    if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS)
      throw new BadRequestException({
        status: 'Error',
        mensaje: `El rango no puede superar ${MAX_RANGE_DAYS} días`,
      })
  }

  private async forEachDate<T>(
    from: string,
    to: string,
    work: (date: string) => Promise<T>,
  ): Promise<{ dates: number; results: T[] }> {
    this.validateHistoryRange(from, to)
    if (this.running)
      throw new ConflictException({
        status: 'Error',
        mensaje:
          'Ya hay un análisis o una reconstrucción en curso; espera a que termine',
      })
    this.running = true
    try {
      const results: T[] = []
      for (let date = from; date <= to; date = addDaysToKey(date, 1))
        results.push(await work(date))
      return { dates: results.length, results }
    } finally {
      this.running = false
    }
  }

  async backfillRules(from: string, to: string) {
    const totals = {
      fatigue: { created: 0, updated: 0, removed: 0, failed: 0 },
      risk: { created: 0, updated: 0, removed: 0, failed: 0 },
    }
    const { dates } = await this.forEachDate(from, to, async (date) => {
      const fatigue = await this.fatigueAlertsCronService.runForDate(date)
      const risk = await this.injuryRiskAssessmentsCronService.runForDate(date)
      for (const key of ['created', 'updated', 'removed', 'failed'] as const) {
        totals.fatigue[key] += fatigue[key]
        totals.risk[key] += risk[key]
      }
    })
    this.logger.log(
      `Histórico de reglas ${from} a ${to}: ${totals.fatigue.created} alertas de fatiga y ${totals.risk.created} evaluaciones de riesgo creadas`,
    )
    return {
      status: 'Success',
      mensaje: `Histórico de alertas de fatiga y reglas de riesgo reconstruido para ${dates} días`,
      dates,
      fatigue_alerts: totals.fatigue,
      risk_assessments: totals.risk,
    }
  }

  async backfillPredictions(from: string, to: string) {
    const { dates, results } = await this.forEachDate(from, to, (date) =>
      this.mlInferenceService.runForDate(date),
    )
    const total = results.reduce(
      (sum: Omit<InferenceSummary, 'engine' | 'skipped_reason'>, item) => ({
        predicted: sum.predicted + item.predicted,
        assessments_created: sum.assessments_created + item.assessments_created,
        failed: sum.failed + item.failed,
      }),
      { predicted: 0, assessments_created: 0, failed: 0 },
    )
    const skipped = results.find((item) => item.skipped_reason)?.skipped_reason
    return {
      status: 'Success',
      mensaje: `Predicciones del modelo de riesgo reconstruidas para ${dates} días: ${total.predicted} predicciones`,
      dates,
      engine: results[0]?.engine ?? null,
      ...total,
      skipped_reason: total.predicted === 0 ? (skipped ?? null) : null,
    }
  }

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
