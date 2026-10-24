import { paginateList } from './pagination.util'

describe('paginateList', () => {
  const items = [1, 2, 3, 4, 5]

  it('devuelve la página pedida con su paginación', () => {
    expect(paginateList(items, { page: 2, limit: 2 })).toEqual({
      items: [3, 4],
      pagination: { total: 5, page: 2, limit: 2, totalPages: 3 },
    })
  })

  it('devuelve la lista completa si no se pide página', () => {
    expect(paginateList(items)).toEqual({
      items,
      pagination: { total: 5, page: 1, limit: 5, totalPages: 1 },
    })
  })

  it('informa cero páginas sin registros', () => {
    expect(paginateList([], { page: 1 }).pagination).toEqual({
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    })
  })
})
