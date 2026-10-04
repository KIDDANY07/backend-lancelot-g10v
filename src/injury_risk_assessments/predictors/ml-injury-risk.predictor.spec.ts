import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjuryRiskLevel } from '../entities/injury-risk-assessment.entity'
import {
  MlInjuryRiskPredictor,
  MlPredictionInput,
} from './ml-injury-risk.predictor'
import {
  buildMlFeaturePayload,
  classifyProbability,
  describeFactor,
} from './ml-features-payload'

jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))

const THRESHOLDS = { prob_medium_threshold: 0.25, prob_high_threshold: 0.5 }

const INPUT: MlPredictionInput = {
  features: { acwr_ewma: 1.6, high_rpe_sessions_14d: 4 },
  model: { id_model: 3, version: 'lr-2026-10-01' },
  thresholds: THRESHOLDS,
}

function buildPredictor(env: Record<string, string | undefined>) {
  const configService = {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService
  return new MlInjuryRiskPredictor(configService)
}

const ENV = {
  ML_SERVICE_URL: 'http://ml-service:8000/',
  ML_SERVICE_API_KEY: 'secret',
  ML_SERVICE_TIMEOUT_MS: '50',
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response
}

describe('MlInjuryRiskPredictor', () => {
  const originalFetch = global.fetch
  let fetchMock: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn()
    global.fetch = fetchMock
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('maps a successful response to a prediction with Spanish factors', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        probability: 0.62,
        model_version: 'lr-2026-10-01',
        top_factors: [
          { feature: 'sessions_7d', contribution: 0.05 },
          { feature: 'acwr_ewma', contribution: 0.42 },
          { feature: 'days_since_last_injury', contribution: -0.2 },
          { feature: 'high_rpe_sessions_14d', contribution: 0.31 },
        ],
      }),
    )
    const result = await buildPredictor(ENV).predict(INPUT)

    expect(result).toEqual({
      riskLevel: InjuryRiskLevel.ALTO,
      probability: 0.62,
      id_model: 3,
      top_factors: [
        { feature: 'acwr_ewma', contribution: 0.42 },
        { feature: 'high_rpe_sessions_14d', contribution: 0.31 },
        { feature: 'days_since_last_injury', contribution: -0.2 },
      ],
      factors: [
        'ACWR exponencial: aumenta el riesgo (+0.42)',
        'Sesiones de RPE alto (14 días): aumenta el riesgo (+0.31)',
        'Días desde la última lesión: reduce el riesgo (-0.20)',
      ],
    })
  })

  it('sends only the features, the model version and the API key', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        probability: 0.1,
        model_version: 'lr-2026-10-01',
        top_factors: [],
      }),
    )
    await buildPredictor(ENV).predict(INPUT)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://ml-service:8000/predict')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'x-api-key': 'secret' })
    expect(JSON.parse(init.body as string)).toEqual({
      model_version: 'lr-2026-10-01',
      features: { acwr_ewma: 1.6, high_rpe_sessions_14d: 4 },
    })
  })

  it('returns null on timeout', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        }),
    )
    await expect(buildPredictor(ENV).predict(INPUT)).resolves.toBeNull()
  })

  it('returns null on a 500 error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'boom' }, 500))
    await expect(buildPredictor(ENV).predict(INPUT)).resolves.toBeNull()
  })

  it('returns null when the service is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(buildPredictor(ENV).predict(INPUT)).resolves.toBeNull()
  })

  it('returns null on an invalid body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ probability: 1.7 }))
    await expect(buildPredictor(ENV).predict(INPUT)).resolves.toBeNull()
  })

  it('returns null when the service used a model different from the active one', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        probability: 0.4,
        model_version: 'otro-modelo',
        top_factors: [],
      }),
    )
    await expect(buildPredictor(ENV).predict(INPUT)).resolves.toBeNull()
  })

  it('returns null without calling the service when ML_SERVICE_URL is missing', async () => {
    await expect(
      buildPredictor({ ...ENV, ML_SERVICE_URL: undefined }).predict(INPUT),
    ).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('ml-features-payload', () => {
  it('classifies probabilities with the configured thresholds', () => {
    expect(classifyProbability(0.1, THRESHOLDS)).toBe(InjuryRiskLevel.BAJO)
    expect(classifyProbability(0.25, THRESHOLDS)).toBe(InjuryRiskLevel.MEDIO)
    expect(classifyProbability(0.5, THRESHOLDS)).toBe(InjuryRiskLevel.ALTO)
  })

  it('keeps only allow-listed features and converts Postgres decimals', () => {
    const payload = buildMlFeaturePayload(
      {
        id_user: 7,
        date: '2026-03-28',
        acwr: '1.35',
        sessions_7d: 4,
        is_recovering: false,
        position: 'delantero',
        days_since_last_injury: null,
        label_injury_7d: true,
      },
      [
        'id_user',
        'date',
        'acwr',
        'sessions_7d',
        'is_recovering',
        'position',
        'days_since_last_injury',
        'label_injury_7d',
      ],
    )
    expect(payload).toEqual({
      acwr: 1.35,
      sessions_7d: 4,
      is_recovering: false,
      position: 'delantero',
      days_since_last_injury: null,
    })
  })

  it('falls back to the raw feature name when there is no translation', () => {
    expect(describeFactor({ feature: 'nueva_variable', contribution: 0 })).toBe(
      'nueva_variable: aumenta el riesgo (+0.00)',
    )
  })
})
