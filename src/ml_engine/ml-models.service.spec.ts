import { BadRequestException } from '@nestjs/common'
import { Repository } from 'typeorm'
import { MlModel } from './entities/ml-model.entity'
import { MlGovernanceRulesService } from './ml-governance-rules.service'
import { MlModelsService } from './ml-models.service'
import { MlReadinessService } from './ml-readiness.service'

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}))

const BASE_MODEL = {
  id_model: 5,
  version: 'hgb-1',
  feature_version: 'v1',
  is_synthetic: false,
  is_active: false,
  metrics: { pr_auc: 0.3 },
  rules_baseline_metrics: { pr_auc: 0.2 },
} as MlModel

function buildService(model: MlModel | null, ready: boolean) {
  const manager = { update: jest.fn().mockResolvedValue({}) }
  const repository = {
    findOne: jest.fn().mockResolvedValue(model),
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
  )
  return { service, manager }
}

describe('MlModelsService.activate', () => {
  it('deactivates the previous model and activates the new one', async () => {
    const { service, manager } = buildService({ ...BASE_MODEL }, true)
    const result = await service.activate(5)

    expect(manager.update).toHaveBeenNthCalledWith(
      1,
      MlModel,
      { is_active: true },
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
