import { BadRequestException } from '@nestjs/common'
import { Repository } from 'typeorm'
import type { SeasonsService } from 'src/seasons/seasons.service'
import type { UsersService } from 'src/users/users.service'
import { TechnicalEvaluation } from './entities/technical-evaluation.entity'
import {
  EVALUATION_INDICATORS,
  EvaluationDimension,
} from './evaluation-catalog'
import { TechnicalEvaluationsService } from './technical-evaluations.service'

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}))
jest.mock('src/seasons/seasons.service', () => ({ SeasonsService: class {} }))
jest.mock('src/users/users.service', () => ({ UsersService: class {} }))

const BASE = {
  id_user: 7,
  id_season: 1,
  score: 8,
  evaluator_id: 2,
  eval_date: '2026-09-02',
}

function buildService(existing: Partial<TechnicalEvaluation> | null = null) {
  const repository = {
    save: jest.fn((entity: Partial<TechnicalEvaluation>) =>
      Promise.resolve({ id_eval_tech: 10, ...entity }),
    ),
    findOne: jest
      .fn()
      .mockResolvedValue(
        existing ? { id_eval_tech: 10, ...existing } : { id_eval_tech: 10 },
      ),
    merge: jest.fn((target: Partial<TechnicalEvaluation>, changes: object) => ({
      ...target,
      ...changes,
    })),
  }
  const usersService = { findOneById: jest.fn().mockResolvedValue({}) }
  const seasonsService = { findOneById: jest.fn().mockResolvedValue({}) }
  const service = new TechnicalEvaluationsService(
    repository as unknown as Repository<TechnicalEvaluation>,
    usersService as unknown as UsersService,
    seasonsService as unknown as SeasonsService,
  )
  return { service, repository }
}

describe('TechnicalEvaluationsService', () => {
  it('exposes the fixed catalog of each dimension', () => {
    const { service } = buildService()
    expect(service.getCatalog().catalog).toEqual([
      {
        dimension: EvaluationDimension.TECNICA,
        indicators: EVALUATION_INDICATORS[EvaluationDimension.TECNICA],
      },
      {
        dimension: EvaluationDimension.TACTICA,
        indicators: EVALUATION_INDICATORS[EvaluationDimension.TACTICA],
      },
    ])
  })

  it('registers a tactical evaluation with an indicator of its catalog', async () => {
    const { service, repository } = buildService()
    await service.create({
      ...BASE,
      dimension: EvaluationDimension.TACTICA,
      indicator: 'Desmarque',
    })
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        dimension: EvaluationDimension.TACTICA,
        indicator: 'Desmarque',
      }),
    )
  })

  it('rejects an indicator that belongs to the other dimension', async () => {
    const { service, repository } = buildService()
    const attempt = service.create({
      ...BASE,
      dimension: EvaluationDimension.TACTICA,
      indicator: 'Pase corto',
    })
    await expect(attempt).rejects.toBeInstanceOf(BadRequestException)
    await expect(attempt).rejects.toMatchObject({
      response: {
        mensaje: expect.stringContaining(
          'no pertenece a la evaluación táctica',
        ) as string,
      },
    })
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('validates the pair again when the dimension changes', async () => {
    const { service } = buildService({
      dimension: EvaluationDimension.TECNICA,
      indicator: 'Regate',
    })
    await expect(
      service.update(10, { dimension: EvaluationDimension.TACTICA }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('lets an old free-text evaluation change its score without touching the indicator', async () => {
    const { service, repository } = buildService({
      ...BASE,
      dimension: EvaluationDimension.TECNICA,
      indicator: 'Juego aéreo',
    })
    await service.update(10, { score: 9 })
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ indicator: 'Juego aéreo', score: 9 }),
    )
  })
})
