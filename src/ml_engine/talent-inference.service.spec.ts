import { Logger } from '@nestjs/common'
import { Repository } from 'typeorm'
import { AthleteSeasonFeatures } from 'src/ml_features/entities/athlete-season-features.entity'
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
import {
  MlTalentPredictor,
  TalentPredictionResult,
} from './predictors/ml-talent.predictor'
import {
  TALENT_ML_RULE,
  TalentInferenceService,
} from './talent-inference.service'
import { buildTalentFeaturePayload } from './talent-features-payload'

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}))
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))

const MODEL = {
  id_model: 9,
  version: 'rf-talento',
  task: MlModelTask.TALENT,
  feature_version: 't1',
  features: ['index_percentile', 'plays_up', 'tactical_score'],
}

function row(id_user: number) {
  return {
    id_user,
    id_season: 4,
    index_percentile: '92.50',
    plays_up: false,
    tactical_score: null,
    rules_flagged: id_user === 1,
    feature_version: 't1',
  } as unknown as AthleteSeasonFeatures
}

function result(probability: number): TalentPredictionResult {
  return {
    probability,
    top_factors: [{ feature: 'index_percentile', contribution: 0.8 }],
  }
}

function buildService(options: {
  engine: MlEngineMode
  predictions: (TalentPredictionResult | null)[]
  flags?: TalentFlag[]
  model?: typeof MODEL | null
}) {
  const predictionsRepository = { upsert: jest.fn().mockResolvedValue({}) }
  const flagsRepository = {
    find: jest.fn().mockResolvedValue(options.flags ?? []),
    save: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({}),
  }
  const featuresRepository = {
    find: jest
      .fn()
      .mockResolvedValue(options.predictions.map((_, index) => row(index + 1))),
  }
  const predictor = { predict: jest.fn() }
  options.predictions.forEach((prediction) =>
    predictor.predict.mockResolvedValueOnce(prediction),
  )
  const service = new TalentInferenceService(
    featuresRepository as unknown as Repository<AthleteSeasonFeatures>,
    predictionsRepository as unknown as Repository<TalentPrediction>,
    flagsRepository as unknown as Repository<TalentFlag>,
    {
      getActive: jest.fn().mockResolvedValue({
        talent_engine: options.engine,
        talent_prob_threshold: '0.600',
      }),
    } as unknown as MlEngineConfigService,
    {
      findActiveEntity: jest
        .fn()
        .mockResolvedValue(options.model === undefined ? MODEL : options.model),
    } as unknown as MlModelsService,
    new MlGovernanceRulesService(),
    predictor as unknown as MlTalentPredictor,
  )
  return { service, predictionsRepository, flagsRepository, predictor }
}

describe('TalentInferenceService', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })

  it('does nothing while the talent engine is in rules mode', async () => {
    const { service, predictor } = buildService({
      engine: MlEngineMode.RULES,
      predictions: [result(0.9)],
    })
    const summary = await service.runForSeason(4)
    expect(summary.skipped_reason).toBe('Motor de talento en modo rules')
    expect(predictor.predict).not.toHaveBeenCalled()
  })

  it('skips when there is no active talent model', async () => {
    const { service } = buildService({
      engine: MlEngineMode.SHADOW,
      predictions: [result(0.9)],
      model: null,
    })
    expect((await service.runForSeason(4)).skipped_reason).toBe(
      'No hay un modelo de talento activo',
    )
  })

  it('stores predictions in shadow mode without creating flags', async () => {
    const { service, predictionsRepository, flagsRepository } = buildService({
      engine: MlEngineMode.SHADOW,
      predictions: [result(0.9), result(0.2)],
    })
    const summary = await service.runForSeason(4)

    expect(summary.predicted).toBe(2)
    expect(predictionsRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id_user: 1,
        id_season: 4,
        id_model: 9,
        probability: 0.9,
        rules_flagged: true,
        engine_mode: MlEngineMode.SHADOW,
      }),
      ['id_user', 'id_season'],
    )
    expect(flagsRepository.save).not.toHaveBeenCalled()
  })

  it('creates open ml flags above the threshold and removes stale open ones', async () => {
    const stale = {
      id_flag: 30,
      id_user: 2,
      id_season: 4,
      source: TalentFlagSource.ML,
      status: TalentFlagStatus.OPEN,
    } as TalentFlag
    const { service, flagsRepository } = buildService({
      engine: MlEngineMode.ML,
      predictions: [result(0.75), result(0.3)],
      flags: [stale],
    })
    const summary = await service.runForSeason(4)

    expect(summary).toMatchObject({ flags_created: 1, flags_removed: 1 })
    expect(flagsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id_user: 1,
        source: TalentFlagSource.ML,
        status: TalentFlagStatus.OPEN,
        score: 75,
        triggered_rules: [TALENT_ML_RULE],
        warnings: [
          'Percentil en su categoría: aumenta la probabilidad de ascenso (+0.80)',
        ],
      }),
    )
    expect(flagsRepository.remove).toHaveBeenCalledWith(stale)
  })

  it('never touches an ml flag the staff already reviewed', async () => {
    const reviewed = {
      id_flag: 31,
      id_user: 1,
      id_season: 4,
      source: TalentFlagSource.ML,
      status: TalentFlagStatus.DISMISSED,
    } as TalentFlag
    const { service, flagsRepository } = buildService({
      engine: MlEngineMode.ML,
      predictions: [result(0.95)],
      flags: [reviewed],
    })
    await service.runForSeason(4)
    expect(flagsRepository.save).not.toHaveBeenCalled()
  })

  it('counts failures when the ML service does not answer', async () => {
    const { service } = buildService({
      engine: MlEngineMode.SHADOW,
      predictions: [null],
    })
    expect((await service.runForSeason(4)).failed).toBe(1)
  })

  it('sends only whitelisted numeric features', () => {
    expect(
      buildTalentFeaturePayload(
        { index_percentile: '92.50', plays_up: false, id_user: 7, name: 'Ana' },
        ['index_percentile', 'plays_up', 'id_user', 'name'],
      ),
    ).toEqual({ index_percentile: 92.5, plays_up: false })
  })
})
