import { BadRequestException, Logger } from '@nestjs/common'
import { Repository } from 'typeorm'
import { MlModel, MlModelTask } from './entities/ml-model.entity'
import { MlGovernanceRulesService } from './ml-governance-rules.service'
import {
  MlEngineConfig,
  MlEngineMode,
} from './entities/ml-engine-config.entity'
import { MlModelsService } from './ml-models.service'
import { MlReadinessService } from './ml-readiness.service'
import { MlServiceClient } from './ml-service.client'
import { TalentReadinessService } from './talent-readiness.service'

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}))
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))

const BASE_MODEL = {
  id_model: 5,
  version: 'hgb-1',
  task: MlModelTask.INJURY_RISK,
  feature_version: 'v1',
  is_synthetic: false,
  is_active: false,
  metrics: { pr_auc: 0.3 },
  rules_baseline_metrics: { pr_auc: 0.2 },
} as MlModel

function buildService(
  model: MlModel | null,
  ready: boolean,
  talentReady = false,
  engineConfig: Partial<MlEngineConfig> = {
    id_config: 1,
    engine: MlEngineMode.RULES,
    talent_engine: MlEngineMode.RULES,
  },
) {
  const manager = {
    update: jest.fn().mockResolvedValue({}),
    find: jest.fn().mockResolvedValue([engineConfig]),
  }
  const mlServiceClient = {
    baseUrl: 'http://ml-service:8000',
    request: jest.fn().mockResolvedValue({ ok: true, status: 200, body: {} }),
  }
  const repository = {
    findOne: jest.fn().mockResolvedValue(model),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    manager: {
      transaction: jest.fn(async (work: (m: typeof manager) => Promise<void>) =>
        work(manager),
      ),
    },
  }
  const readinessService = {
    evaluate: jest.fn().mockResolvedValue({ ready, criteria: [] }),
  }
  const service = new MlModelsService(
    repository as unknown as Repository<MlModel>,
    readinessService as unknown as MlReadinessService,
    new MlGovernanceRulesService(),
    {
      evaluate: jest
        .fn()
        .mockResolvedValue({ ready: talentReady, criteria: [] }),
    } as unknown as TalentReadinessService,
    mlServiceClient as unknown as MlServiceClient,
  )
  return { service, manager, repository, mlServiceClient }
}

describe('MlModelsService.activate', () => {
  it('deactivates the previous model and activates the new one', async () => {
    const { service, manager } = buildService({ ...BASE_MODEL }, true)
    const result = await service.activate(5)

    expect(manager.update).toHaveBeenNthCalledWith(
      1,
      MlModel,
      { is_active: true, task: MlModelTask.INJURY_RISK },
      { is_active: false },
    )
    expect(manager.update).toHaveBeenNthCalledWith(
      2,
      MlModel,
      { id_model: 5 },
      { is_active: true },
    )
    expect(result.model.is_active).toBe(true)
  })

  it('activates a talent model against the talent readiness and its own task', async () => {
    const { service, manager } = buildService(
      { ...BASE_MODEL, task: MlModelTask.TALENT, feature_version: 't1' },
      false,
      true,
    )
    const result = await service.activate(5)

    expect(manager.update).toHaveBeenNthCalledWith(
      1,
      MlModel,
      { is_active: true, task: MlModelTask.TALENT },
      { is_active: false },
    )
    expect(result.mensaje).toBe('Modelo de ML de talento activado con éxito')
  })

  it('rejects a talent model without talent readiness', async () => {
    const { service } = buildService(
      { ...BASE_MODEL, task: MlModelTask.TALENT, feature_version: 't1' },
      true,
      false,
    )
    await expect(service.activate(5)).rejects.toMatchObject({
      response: {
        mensaje: expect.stringContaining('readiness') as string,
      },
    })
  })

  it('rejects a synthetic model with the reason in Spanish', async () => {
    const { service, manager } = buildService(
      { ...BASE_MODEL, is_synthetic: true },
      true,
    )
    await expect(service.activate(5)).rejects.toThrow(BadRequestException)
    await expect(service.activate(5)).rejects.toMatchObject({
      response: {
        status: 'Error',
        mensaje: expect.stringContaining('sintéticos') as string,
      },
    })
    expect(manager.update).not.toHaveBeenCalled()
  })

  it('rejects activation without readiness', async () => {
    const { service } = buildService({ ...BASE_MODEL }, false)
    await expect(service.activate(5)).rejects.toMatchObject({
      response: {
        mensaje: expect.stringContaining('readiness') as string,
      },
    })
  })

  it('rejects a model that does not beat the rules', async () => {
    const { service } = buildService(
      { ...BASE_MODEL, metrics: { pr_auc: 0.15 } },
      true,
    )
    await expect(service.activate(5)).rejects.toMatchObject({
      response: {
        mensaje: expect.stringContaining('no supera a las reglas') as string,
      },
    })
  })
})

describe('MlModelsService.deactivate', () => {
  it('returns the talent engine to rules when it was using the model', async () => {
    const { service, manager } = buildService(
      { ...BASE_MODEL, task: MlModelTask.TALENT, is_active: true },
      true,
      true,
      {
        id_config: 1,
        engine: MlEngineMode.SHADOW,
        talent_engine: MlEngineMode.ML,
      },
    )
    const result = await service.deactivate(5)

    expect(manager.update).toHaveBeenNthCalledWith(
      1,
      MlModel,
      { id_model: 5 },
      { is_active: false },
    )
    expect(manager.update).toHaveBeenNthCalledWith(
      2,
      MlEngineConfig,
      { id_config: 1 },
      { talent_engine: MlEngineMode.RULES },
    )
    expect(result.mensaje).toContain('volvió a «Solo reglas»')
    expect(result.model.is_active).toBe(false)
  })

  it('leaves the engine untouched when it already uses the rules', async () => {
    const { service, manager } = buildService(
      { ...BASE_MODEL, is_active: true },
      true,
    )
    const result = await service.deactivate(5)

    expect(manager.update).toHaveBeenCalledTimes(1)
    expect(result.mensaje).toBe('Modelo de ML de riesgo de lesión desactivado')
  })

  it('does nothing with an inactive model', async () => {
    const { service, manager } = buildService({ ...BASE_MODEL }, true)
    const result = await service.deactivate(5)

    expect(manager.update).not.toHaveBeenCalled()
    expect(result.mensaje).toBe('El modelo ya estaba inactivo')
  })
})

describe('MlModelsService.remove', () => {
  it('deletes an inactive model and asks the ML service to delete its file', async () => {
    const { service, repository, mlServiceClient } = buildService(
      { ...BASE_MODEL },
      true,
    )
    const result = await service.remove(5)

    expect(repository.delete).toHaveBeenCalledWith({ id_model: 5 })
    expect(mlServiceClient.request).toHaveBeenCalledWith(
      'DELETE',
      '/models/hgb-1',
    )
    expect(result.mensaje).toContain('y su archivo')
  })

  it('still deletes the model when the ML service is unreachable', async () => {
    const { service, repository, mlServiceClient } = buildService(
      { ...BASE_MODEL },
      true,
    )
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    mlServiceClient.request.mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await service.remove(5)

    expect(repository.delete).toHaveBeenCalled()
    expect(result.mensaje).toContain('no confirmó el borrado')
  })

  it('refuses to delete the active model', async () => {
    const { service, repository } = buildService(
      { ...BASE_MODEL, is_active: true },
      true,
    )
    await expect(service.remove(5)).rejects.toThrow(BadRequestException)
    expect(repository.delete).not.toHaveBeenCalled()
  })
})
