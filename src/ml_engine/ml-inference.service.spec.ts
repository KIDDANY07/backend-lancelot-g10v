import { Logger } from '@nestjs/common'
import { Repository } from 'typeorm'
import {
  InjuryRiskAssessment,
  InjuryRiskAssessmentMethod,
  InjuryRiskLevel,
  InjuryRiskRuleCode,
} from 'src/injury_risk_assessments/entities/injury-risk-assessment.entity'
import { PredictionResult } from 'src/injury_risk_assessments/predictors/injury-risk-predictor.interface'
import { MlInjuryRiskPredictor } from 'src/injury_risk_assessments/predictors/ml-injury-risk.predictor'
import { AthleteDailyFeatures } from 'src/ml_features/entities/athlete-daily-features.entity'
import { InjuryRiskPrediction } from './entities/injury-risk-prediction.entity'
import { MlEngineMode } from './entities/ml-engine-config.entity'
import { MlEngineConfigService } from './ml-engine-config.service'
import { MlGovernanceRulesService } from './ml-governance-rules.service'
import { MlInferenceService } from './ml-inference.service'
import { MlModelsService } from './ml-models.service'

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}))
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))

const DATE = '2026-10-01'

const MODEL = {
  id_model: 3,
  version: 'hgb-1',
  feature_version: 'v1',
  features: ['acwr', 'sessions_7d'],
}

function row(id_user: number) {
  return {
    id_user,
    date: DATE,
    acwr: '1.40',
    sessions_7d: 5,
    rules_risk_level: InjuryRiskLevel.MEDIO,
    is_available: true,
  } as unknown as AthleteDailyFeatures
}

function prediction(
  riskLevel: InjuryRiskLevel,
  probability: number,
): PredictionResult {
  return {
    riskLevel,
    probability,
    factors: ['ACWR: aumenta el riesgo (+0.40)'],
    top_factors: [{ feature: 'acwr', contribution: 0.4 }],
    id_model: 3,
  }
}

function buildService(options: {
  engine: MlEngineMode
  rows?: AthleteDailyFeatures[]
  predictions?: (PredictionResult | null)[]
  activeModel?: typeof MODEL | null
}) {
  const featuresRepository = {
    find: jest.fn().mockResolvedValue(options.rows ?? [row(7)]),
  }
  const predictionsRepository = { upsert: jest.fn().mockResolvedValue({}) }
  const assessmentsRepository = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue({}),
  }
  const configService = {
    getActive: jest.fn().mockResolvedValue({
      engine: options.engine,
      prob_medium_threshold: '0.250',
      prob_high_threshold: '0.500',
    }),
  }
  const modelsService = {
    findActiveEntity: jest
      .fn()
      .mockResolvedValue(
        options.activeModel === undefined ? MODEL : options.activeModel,
      ),
  }
  const predictor = { predict: jest.fn() }
  for (const result of options.predictions ?? [
    prediction(InjuryRiskLevel.ALTO, 0.62),
  ])
    predictor.predict.mockResolvedValueOnce(result)

  const service = new MlInferenceService(
    featuresRepository as unknown as Repository<AthleteDailyFeatures>,
    predictionsRepository as unknown as Repository<InjuryRiskPrediction>,
    assessmentsRepository as unknown as Repository<InjuryRiskAssessment>,
    configService as unknown as MlEngineConfigService,
    modelsService as unknown as MlModelsService,
    new MlGovernanceRulesService(),
    predictor as unknown as MlInjuryRiskPredictor,
  )
  return { service, predictor, predictionsRepository, assessmentsRepository }
}

describe('MlInferenceService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => jest.restoreAllMocks())

  it('rules: never calls the ML', async () => {
    const { service, predictor, predictionsRepository } = buildService({
      engine: MlEngineMode.RULES,
    })
    const summary = await service.runForDate(DATE)
    expect(summary.skipped_reason).toBe('Motor en modo rules')
    expect(predictor.predict).not.toHaveBeenCalled()
    expect(predictionsRepository.upsert).not.toHaveBeenCalled()
  })

  it('shadow: stores the prediction with the rules level and creates no assessment', async () => {
    const { service, predictionsRepository, assessmentsRepository } =
      buildService({ engine: MlEngineMode.SHADOW })
    const summary = await service.runForDate(DATE)

    expect(summary).toMatchObject({ predicted: 1, assessments_created: 0 })
    expect(predictionsRepository.upsert).toHaveBeenCalledWith(
      {
        id_user: 7,
        date: DATE,
        id_model: 3,
        probability: 0.62,
        risk_level: InjuryRiskLevel.ALTO,
        top_factors: [{ feature: 'acwr', contribution: 0.4 }],
        rules_risk_level: InjuryRiskLevel.MEDIO,
        engine_mode: MlEngineMode.SHADOW,
      },
      ['id_user', 'date'],
    )
    expect(assessmentsRepository.save).not.toHaveBeenCalled()
  })

  it('sends only the model features (allow-listed and converted to numbers)', async () => {
    const { service, predictor } = buildService({ engine: MlEngineMode.SHADOW })
    await service.runForDate(DATE)
    expect(predictor.predict).toHaveBeenCalledWith({
      features: { acwr: 1.4, sessions_7d: 5 },
      model: { id_model: 3, version: 'hgb-1' },
      thresholds: { prob_medium_threshold: 0.25, prob_high_threshold: 0.5 },
    })
  })

  it('ml: creates an ml_model assessment for medium/high risk', async () => {
    const { service, assessmentsRepository } = buildService({
      engine: MlEngineMode.ML,
    })
    const summary = await service.runForDate(DATE)

    expect(summary.assessments_created).toBe(1)
    expect(assessmentsRepository.findOne).toHaveBeenCalledWith({
      where: {
        id_user: 7,
        assessment_date: DATE,
        method: InjuryRiskAssessmentMethod.ML_MODEL,
      },
    })
    expect(assessmentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id_user: 7,
        method: InjuryRiskAssessmentMethod.ML_MODEL,
        risk_level: InjuryRiskLevel.ALTO,
        triggered_rules: [InjuryRiskRuleCode.ML_PREDICTION],
        details: expect.stringContaining('ACWR: aumenta el riesgo') as string,
      }),
    )
  })

  it('ml: does not create an assessment for low risk', async () => {
    const { service, predictionsRepository, assessmentsRepository } =
      buildService({
        engine: MlEngineMode.ML,
        predictions: [prediction(InjuryRiskLevel.BAJO, 0.05)],
      })
    await service.runForDate(DATE)
    expect(predictionsRepository.upsert).toHaveBeenCalled()
    expect(assessmentsRepository.save).not.toHaveBeenCalled()
  })

  it('ml: does not duplicate an existing ml_model assessment', async () => {
    const { service, assessmentsRepository } = buildService({
      engine: MlEngineMode.ML,
    })
    assessmentsRepository.findOne.mockResolvedValue({ id_assessment: 1 })
    await service.runForDate(DATE)
    expect(assessmentsRepository.save).not.toHaveBeenCalled()
  })

  it('skips without an active model', async () => {
    const { service, predictor } = buildService({
      engine: MlEngineMode.SHADOW,
      activeModel: null,
    })
    const summary = await service.runForDate(DATE)
    expect(summary.skipped_reason).toBe('No hay un modelo de ML activo')
    expect(predictor.predict).not.toHaveBeenCalled()
  })

  it('does not persist anything when the predictor returns null', async () => {
    const { service, predictionsRepository } = buildService({
      engine: MlEngineMode.ML,
      predictions: [null],
    })
    const summary = await service.runForDate(DATE)
    expect(summary.failed).toBe(1)
    expect(predictionsRepository.upsert).not.toHaveBeenCalled()
  })

  it('stops after 5 consecutive failures of the ML service', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(i + 1))
    const { service, predictor } = buildService({
      engine: MlEngineMode.SHADOW,
      rows,
      predictions: Array.from({ length: 8 }, () => null),
    })
    const summary = await service.runForDate(DATE)
    expect(predictor.predict).toHaveBeenCalledTimes(5)
    expect(summary.skipped_reason).toContain('5 fallos seguidos')
  })
})
