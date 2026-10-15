import { ConflictException } from '@nestjs/common'
import { EntityManager } from 'typeorm'
import {
  assertNoReferences,
  countReferences,
  describeReferences,
} from './delete-guard.util'

describe('delete guard', () => {
  it('counts only the tables that still reference the record', async () => {
    const totals: Record<string, number> = { matches: 2, training_sessions: 0 }
    const manager = {
      query: jest.fn((sql: string) =>
        Promise.resolve([{ total: totals[sql.split('"')[1]] }]),
      ),
    } as unknown as EntityManager

    const references = await countReferences(
      manager,
      [
        {
          table: 'matches',
          column: 'id_category',
          singular: 'partido',
          plural: 'partidos',
        },
        {
          table: 'training_sessions',
          column: 'id_category',
          singular: 'sesión',
          plural: 'sesiones',
        },
      ],
      4,
    )

    expect(references).toEqual([
      { singular: 'partido', plural: 'partidos', total: 2 },
    ])
  })

  it('describes the references in natural Spanish', () => {
    expect(
      describeReferences([
        { singular: 'partido', plural: 'partidos', total: 1 },
        { singular: 'sesión', plural: 'sesiones', total: 3 },
        { singular: 'competencia', plural: 'competencias', total: 2 },
      ]),
    ).toBe('1 partido, 3 sesiones y 2 competencias')
  })

  it('blocks the deletion with a conflict that explains what to do', () => {
    expect(() =>
      assertNoReferences(
        'la temporada 2026-2',
        [{ singular: 'partido', plural: 'partidos', total: 2 }],
        'Ciérrala en lugar de eliminarla.',
      ),
    ).toThrow(
      new ConflictException({
        status: 'Error',
        mensaje:
          'No se puede eliminar la temporada 2026-2 porque tiene 2 partidos. Ciérrala en lugar de eliminarla.',
      }),
    )
    expect(() => assertNoReferences('la temporada', [], '')).not.toThrow()
  })
})
