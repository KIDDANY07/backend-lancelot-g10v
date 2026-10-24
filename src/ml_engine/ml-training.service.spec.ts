import {
  BadGatewayException,
  ConflictException,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MlModelTask } from './entities/ml-model.entity'
import { MlModelsService } from './ml-models.service'
import { MlTrainingService } from './ml-training.service'

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}))
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))

const ENV = {
  ML_SERVICE_URL: 'http://ml-service:8000/',
  ML_SERVICE_API_KEY: 'secret',
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response
}

function buildService(env: Record<string, string | undefined> = ENV) {
  const configService = {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService
  const findResponseByVersion = jest.fn((version: string) =>
    Promise.resolve({ id_model: 7, version }),
  )
  const mlModelsService = {
    findResponseByVersion,
  } as unknown as MlModelsService
  return {
    service: new MlTrainingService(configService, mlModelsService),
    findResponseByVersion,
  }
}

describe('MlTrainingService', () => {
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

  it('entrena el modelo de talento en su ruta y devuelve el modelo registrado', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        model: {
          version: 'talento-lr-2026-10-23',
          is_synthetic: false,
          metrics: { pr_auc: 0.8123 },
          rules_baseline_metrics: { pr_auc: 0.5 },
        },
      }),
    )
    const { service, findResponseByVersion } = buildService()

    const result = await service.train(MlModelTask.TALENT)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://ml-service:8000/talent/train')
    expect(init.headers).toMatchObject({ 'x-api-key': 'secret' })
    expect(JSON.parse(init.body as string)).toEqual({ source: 'db' })
    expect(findResponseByVersion).toHaveBeenCalledWith('talento-lr-2026-10-23')
    expect(result.model).toEqual({
      id_model: 7,
      version: 'talento-lr-2026-10-23',
    })
    expect(result.mensaje).toContain('PR-AUC 0.812 frente a 0.500')
  })

  it('usa la ruta de riesgo y avisa cuando el modelo queda sintético', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        model: { version: 'rf-2026-10-23-synthetic', is_synthetic: true },
      }),
    )
    const { service } = buildService()

    const result = await service.train(MlModelTask.INJURY_RISK)

    expect(fetchMock).toHaveBeenCalledWith(
      'http://ml-service:8000/train',
      expect.anything(),
    )
    expect(result.mensaje).toContain('sintético')
  })

  it('traslada como conflicto la readiness pendiente', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: 'No hay datos suficientes' }, 409),
    )
    const { service } = buildService()

    await expect(service.train(MlModelTask.INJURY_RISK)).rejects.toThrow(
      ConflictException,
    )
  })

  it('traslada los errores de entrenamiento y de clave', async () => {
    const { service } = buildService()

    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Una clase' }, 422))
    await expect(service.train(MlModelTask.TALENT)).rejects.toThrow(
      UnprocessableEntityException,
    )

    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'x' }, 401))
    await expect(service.train(MlModelTask.TALENT)).rejects.toThrow(
      BadGatewayException,
    )
  })

  it('responde no disponible sin URL o si el servicio no contesta', async () => {
    await expect(
      buildService({}).service.train(MlModelTask.TALENT),
    ).rejects.toThrow(ServiceUnavailableException)
    expect(fetchMock).not.toHaveBeenCalled()

    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(
      buildService().service.train(MlModelTask.TALENT),
    ).rejects.toThrow(ServiceUnavailableException)
  })
})
