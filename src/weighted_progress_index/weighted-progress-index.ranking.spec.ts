import { Repository } from 'typeorm'
import { AthletesInCategory } from 'src/athletes_in_categories/entities/athletes_in_category.entity'
import { WeightedProgressIndex } from './entities/weighted-progress-index.entity'
import { WeightedProgressIndexService } from './weighted-progress-index.service'

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}))
jest.mock('src/users/users.service', () => ({ UsersService: class {} }))
jest.mock('src/seasons/seasons.service', () => ({ SeasonsService: class {} }))
jest.mock(
  'src/position_weight_profiles/position-weight-profiles.service',
  () => ({ PositionWeightProfilesService: class {} }),
)

const SUB15 = { id_category: 4, name: 'Sub-15', max_age: 15 }
const SUB17 = { id_category: 5, name: 'Sub-17', max_age: 17 }

function athlete(id_user: number, name: string) {
  return { id_user, name, lastname: 'Prueba' }
}

function buildService(
  indices: Partial<WeightedProgressIndex>[],
  assignments: Partial<AthletesInCategory>[],
) {
  const indexRepository = { find: jest.fn().mockResolvedValue(indices) }
  const assignmentsRepository = {
    find: jest.fn().mockResolvedValue(assignments),
  }
  const unused = {} as never
  return new WeightedProgressIndexService(
    indexRepository as unknown as Repository<WeightedProgressIndex>,
    assignmentsRepository as unknown as Repository<AthletesInCategory>,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
  )
}

const ASSIGNMENTS = [
  {
    id_ath_cat: 1,
    id_user: 1,
    id_category: 5,
    category: SUB17,
    user: athlete(1, 'Ana'),
  },
  {
    id_ath_cat: 2,
    id_user: 1,
    id_category: 4,
    category: SUB15,
    user: athlete(1, 'Ana'),
  },
  {
    id_ath_cat: 3,
    id_user: 2,
    id_category: 5,
    category: SUB17,
    user: athlete(2, 'Beto'),
  },
  {
    id_ath_cat: 4,
    id_user: 3,
    id_category: 5,
    category: SUB17,
    user: athlete(3, 'Carla'),
  },
  {
    id_ath_cat: 5,
    id_user: 4,
    id_category: 4,
    category: SUB15,
    user: athlete(4, 'Dora'),
  },
] as Partial<AthletesInCategory>[]

const INDICES = [
  { id_index: 10, id_user: 1, index_value: 70, athlete: athlete(1, 'Ana') },
  { id_index: 11, id_user: 2, index_value: 90, athlete: athlete(2, 'Beto') },
  { id_index: 12, id_user: 3, index_value: 80, athlete: athlete(3, 'Carla') },
] as unknown as Partial<WeightedProgressIndex>[]

describe('WeightedProgressIndexService.ranking', () => {
  it('ordena por índice y numera la posición a través de las páginas', async () => {
    const service = buildService(INDICES, ASSIGNMENTS)

    const result = await service.ranking({ id_season: 1, page: 2, limit: 2 })

    expect(result.pagination).toEqual({
      total: 3,
      page: 2,
      limit: 2,
      totalPages: 2,
    })
    expect(result.ranking).toHaveLength(1)
    expect(result.ranking[0]).toMatchObject({
      rank: 3,
      athlete_name: 'Ana Prueba',
      id_category: 4,
      category_name: 'Sub-15',
    })
  })

  it('filtra por la categoría base y cuenta a quienes no tienen índice', async () => {
    const service = buildService(INDICES, ASSIGNMENTS)

    const result = await service.ranking({ id_season: 1, id_category: 4 })

    expect(result.ranking.map((entry) => entry.athlete_name)).toEqual([
      'Ana Prueba',
    ])
    expect(result.missing).toEqual({ total: 1, first: 'Dora Prueba' })
  })
})
