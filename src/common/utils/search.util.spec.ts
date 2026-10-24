import { SelectQueryBuilder } from 'typeorm'
import { applyWordSearch, normalizeSearch } from './search.util'

function fakeQuery() {
  const andWhere = jest.fn()
  const query = { andWhere } as unknown as SelectQueryBuilder<object>
  andWhere.mockReturnValue(query)
  return { query, andWhere }
}

describe('normalizeSearch', () => {
  it('quita tildes, pasa a minúsculas y separa las palabras', () => {
    expect(normalizeSearch('  José   MUÑOZ ')).toEqual(['jose', 'munoz'])
  })
})

describe('applyWordSearch', () => {
  it('exige cada palabra en las columnas sin tildes', () => {
    const { query, andWhere } = fakeQuery()

    applyWordSearch(query, ['user.name', 'user.lastname'], 'Dávila luk')

    expect(andWhere).toHaveBeenCalledTimes(2)
    const [condition, params] = andWhere.mock.calls[0] as [string, object]
    expect(condition).toContain("CONCAT_WS(' ', user.name, user.lastname)")
    expect(condition).toContain('LIKE :search0')
    expect(params).toEqual({ search0: '%davila%' })
    expect(andWhere).toHaveBeenNthCalledWith(2, expect.any(String), {
      search1: '%luk%',
    })
  })

  it('escapa los comodines de LIKE', () => {
    const { query, andWhere } = fakeQuery()

    applyWordSearch(query, ['user.email'], '50%_a')

    expect(andWhere).toHaveBeenCalledWith(expect.any(String), {
      search0: '%50\\%\\_a%',
    })
  })

  it('no filtra sin texto', () => {
    const { query, andWhere } = fakeQuery()

    applyWordSearch(query, ['user.name'], '   ')

    expect(andWhere).not.toHaveBeenCalled()
  })
})
