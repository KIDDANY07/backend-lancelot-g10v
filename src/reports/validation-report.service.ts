import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Between, Repository } from 'typeorm'
import { addDaysToKey, todayKey } from 'src/common/utils/date.util'
import {
  FatigueAlert,
  FatigueAlertLevel,
  FatigueAlertStatus,
} from 'src/fatigue_alerts/entities/fatigue-alert.entity'
import { Injury, InjuryMechanism } from 'src/injuries/entities/injury.entity'
import {
  InjuryRiskAssessment,
  InjuryRiskAssessmentMethod,
  InjuryRiskAssessmentStatus,
  InjuryRiskLevel,
} from 'src/injury_risk_assessments/entities/injury-risk-assessment.entity'
import { InjuryRiskPrediction } from 'src/ml_engine/entities/injury-risk-prediction.entity'
import { MlFeaturesService } from 'src/ml_features/ml-features.service'
import {
  TalentFlag,
  TalentFlagSource,
  TalentFlagStatus,
} from 'src/talent_flags/entities/talent-flag.entity'
import {
  InjuryEvent,
  RiskSignal,
  VALIDATION_WINDOW_DAYS,
  ValidationMetricsService,
} from './validation-metrics.service'

function withoutWarnings<T extends { warnings: string[] }>(
  value: T,
): Omit<T, 'warnings'> {
  const copy: Partial<T> = { ...value }
  delete copy.warnings
  return copy as Omit<T, 'warnings'>
}

const DEFINITIONS = {
  dismissal_rate:
    'Descartadas / (revisadas + descartadas), en porcentaje. Aproxima la utilidad percibida por el cuerpo técnico: una tasa alta indica alertas poco útiles',
  sensitivity: `Porcentaje de lesiones sin contacto del periodo precedidas por una evaluación de riesgo medio o alto del mismo deportista en los ${VALIDATION_WINDOW_DAYS} días previos`,
  positive_predictive_value: `Porcentaje de evaluaciones de riesgo medio o alto seguidas por una lesión sin contacto del mismo deportista en los ${VALIDATION_WINDOW_DAYS} días siguientes. Solo se evalúan las que ya cumplieron esa ventana`,
  acceptance_rate:
    'Revisadas / (revisadas + descartadas), en porcentaje, por origen de la señalización de talento',
  agreement:
    'Porcentaje de días-deportista en que el ML y las reglas coinciden (ambos medio/alto o ambos sin riesgo)',
}

@Injectable()
export class ValidationReportService {
  constructor(
    @InjectRepository(FatigueAlert)
    private readonly fatigueAlertsRepository: Repository<FatigueAlert>,
    @InjectRepository(InjuryRiskAssessment)
    private readonly assessmentsRepository: Repository<InjuryRiskAssessment>,
    @InjectRepository(Injury)
    private readonly injuriesRepository: Repository<Injury>,
    @InjectRepository(TalentFlag)
    private readonly talentFlagsRepository: Repository<TalentFlag>,
    @InjectRepository(InjuryRiskPrediction)
    private readonly predictionsRepository: Repository<InjuryRiskPrediction>,
    private readonly mlFeaturesService: MlFeaturesService,
    private readonly validationMetricsService: ValidationMetricsService,
  ) {}

  async getValidationReport(from: string, to: string) {
    if (from > to)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'La fecha inicial no puede ser posterior a la final',
      })

    const today = todayKey()
    const lookbackFrom = addDaysToKey(from, -VALIDATION_WINDOW_DAYS)
    const lookaheadTo = addDaysToKey(to, VALIDATION_WINDOW_DAYS)
    const metrics = this.validationMetricsService

    const [
      fatigueAlerts,
      assessments,
      injuries,
      talentFlags,
      predictions,
      dataQuality,
    ] = await Promise.all([
      this.fatigueAlertsRepository.find({
        where: { date: Between(from, to) },
        select: { level: true, status: true },
      }),
      this.assessmentsRepository.find({
        where: { assessment_date: Between(lookbackFrom, to) },
        select: {
          id_user: true,
          assessment_date: true,
          method: true,
          risk_level: true,
          status: true,
        },
      }),
      this.injuriesRepository.find({
        where: { injury_date: Between(lookbackFrom, lookaheadTo) },
        select: { id_user: true, injury_date: true, mechanism: true },
      }),
      this.talentFlagsRepository.find({
        where: {
          created_at: Between(
            new Date(`${from}T00:00:00Z`),
            new Date(`${to}T23:59:59.999Z`),
          ),
        },
        select: { source: true, status: true },
      }),
      this.predictionsRepository.find({
        where: { date: Between(lookbackFrom, to) },
        select: {
          id_user: true,
          date: true,
          risk_level: true,
          rules_risk_level: true,
        },
      }),
      this.mlFeaturesService.computeDataQuality(from, to),
    ])

    const inPeriod = (date: string) => date >= from && date <= to
    const warnings: string[] = []

    const fatigue = metrics.summarizeReviews(
      fatigueAlerts.map((a) => ({ level: a.level, status: a.status })),
      Object.values(FatigueAlertLevel),
      Object.values(FatigueAlertStatus),
      'Alertas de fatiga',
    )

    const periodAssessments = assessments.filter((a) =>
      inPeriod(a.assessment_date),
    )
    const riskSummary = metrics.summarizeReviews(
      periodAssessments.map((a) => ({ level: a.risk_level, status: a.status })),
      Object.values(InjuryRiskLevel),
      Object.values(InjuryRiskAssessmentStatus),
      'Evaluaciones de riesgo',
    )
    const byMethod: Record<string, number> = {}
    for (const method of Object.values(InjuryRiskAssessmentMethod))
      byMethod[method] = periodAssessments.filter(
        (a) => a.method === method,
      ).length

    const nonContact: InjuryEvent[] = injuries
      .filter((i) => i.mechanism === InjuryMechanism.SIN_CONTACTO)
      .map((i) => ({ id_user: i.id_user, injury_date: i.injury_date }))
    const nonContactInPeriod = nonContact.filter((i) => inPeriod(i.injury_date))
    const unknownMechanism = injuries.filter(
      (i) => !i.mechanism && inPeriod(i.injury_date),
    ).length
    if (unknownMechanism > 0)
      warnings.push(
        `${unknownMechanism} lesiones del periodo no tienen mecanismo registrado y no se incluyen en la sensibilidad ni en el valor predictivo`,
      )

    const rulesSignals: RiskSignal[] = assessments
      .filter((a) => a.method === InjuryRiskAssessmentMethod.RULES)
      .map((a) => ({
        id_user: a.id_user,
        date: a.assessment_date,
        level: a.risk_level,
      }))
    const rulesSensitivity = metrics.sensitivity(
      nonContactInPeriod,
      rulesSignals,
      'Sensibilidad de la fase 1',
    )
    const rulesPpv = metrics.positivePredictiveValue(
      rulesSignals.filter((s) => inPeriod(s.date)),
      nonContact,
      today,
      'Valor predictivo de la fase 1',
    )

    const talent = metrics.talentAcceptance(
      talentFlags.map((f) => ({ source: f.source, status: f.status })),
      Object.values(TalentFlagSource),
      Object.values(TalentFlagStatus),
    )

    let shadowMode: Record<string, unknown> | null = null
    if (predictions.length > 0) {
      const mlSignals: RiskSignal[] = predictions.map((p) => ({
        id_user: p.id_user,
        date: p.date,
        level: p.risk_level ?? null,
      }))
      const periodPredictions = predictions.filter((p) => inPeriod(p.date))
      const agreement = metrics.agreement(
        periodPredictions.map((p) => ({
          risk_level: p.risk_level ?? null,
          rules_risk_level: p.rules_risk_level ?? null,
        })),
      )
      const mlSensitivity = metrics.sensitivity(
        nonContactInPeriod,
        mlSignals,
        'Sensibilidad del ML',
      )
      const mlPpv = metrics.positivePredictiveValue(
        mlSignals.filter((s) => inPeriod(s.date)),
        nonContact,
        today,
        'Valor predictivo del ML',
      )
      warnings.push(
        ...agreement.warnings,
        ...mlSensitivity.warnings,
        ...mlPpv.warnings,
      )
      shadowMode = {
        agreement: withoutWarnings(agreement),
        sensitivity: withoutWarnings(mlSensitivity),
        positive_predictive_value: withoutWarnings(mlPpv),
      }
    } else {
      warnings.push(
        'No hay predicciones del ML en el periodo: el modo sombra no estuvo activo o aún no hay un modelo activo',
      )
    }

    warnings.push(
      ...fatigue.warnings,
      ...riskSummary.warnings,
      ...rulesSensitivity.warnings,
      ...rulesPpv.warnings,
      ...talent.warnings,
      ...dataQuality.warnings.map((w) => `Calidad de datos: ${w}`),
    )

    return {
      status: 'Success',
      mensaje: 'Reporte de validación generado con éxito',
      report: {
        period: { from, to },
        window_days: VALIDATION_WINDOW_DAYS,
        fatigue_alerts: withoutWarnings(fatigue),
        injury_risk_assessments: {
          ...withoutWarnings(riskSummary),
          by_method: byMethod,
        },
        rules_phase1: {
          non_contact_injuries: nonContactInPeriod.length,
          injuries_without_mechanism: unknownMechanism,
          sensitivity: withoutWarnings(rulesSensitivity),
          positive_predictive_value: withoutWarnings(rulesPpv),
        },
        talent: talent.by_source,
        shadow_mode: shadowMode,
        data_quality: withoutWarnings(dataQuality),
        definitions: DEFINITIONS,
        warnings,
      },
    }
  }
}
