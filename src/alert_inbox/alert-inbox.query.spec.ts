import { buildInboxWhere, toInboxItem } from './alert-inbox.query'

describe('AlertInboxService helpers', () => {
  it('filtra por estado y, si se piden, por tipo y nivel', () => {
    expect(buildInboxWhere({ status: 'open' })).toEqual({
      where: 'inbox.status = $1',
      params: ['open'],
    })
    expect(
      buildInboxWhere({ status: 'open', kind: 'risk', level: 'alto' }),
    ).toEqual({
      where: 'inbox.status = $1 AND inbox.kind = $2 AND inbox.level = $3',
      params: ['open', 'risk', 'alto'],
    })
  })

  it('normaliza decimales, fechas y reglas disparadas', () => {
    expect(
      toInboxItem({
        kind: 'risk',
        id: 9,
        id_user: 8,
        athlete_name: 'Bruno Díaz ',
        date: '2026-10-03T05:00:00.000Z',
        level: 'alto',
        acwr: '1.71',
        acute_load: null,
        chronic_load: null,
        rpe_avg: null,
        triggered_rules: 'acwr_sostenido,recaida',
        details: 'ACWR alto',
        method: 'rules',
      }),
    ).toEqual({
      kind: 'risk',
      id: 9,
      id_user: 8,
      athlete_name: 'Bruno Díaz',
      date: '2026-10-03',
      level: 'alto',
      acwr_value: 1.71,
      acute_load: null,
      chronic_load: null,
      rpe_avg: null,
      triggered_rules: ['acwr_sostenido', 'recaida'],
      details: 'ACWR alto',
      method: 'rules',
    })
  })
})
