import { NotFoundException } from '@nestjs/common'
import { User } from 'src/users/entities/user.entity'
import { DashboardMetricsService } from './dashboard-metrics.service'
import { DashboardInsightsService } from './dashboard-insights.service'
import { DashboardScopeService } from './dashboard-scope.service'
import { DashboardService } from './dashboard.service'

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}))
jest.mock('src/users/users.service', () => ({ UsersService: class {} }))
jest.mock('src/acwr_config/acwr-config.service', () => ({
  AcwrConfigService: class {},
}))
jest.mock('src/ml_engine/ml-readiness.service', () => ({
  MlReadinessService: class {},
}))
jest.mock('src/ml_engine/talent-readiness.service', () => ({
  TalentReadinessService: class {},
}))

function build(query: jest.Mock = jest.fn().mockResolvedValue([])) {
  const metrics = new DashboardMetricsService()
  const acwr = {
    getActive: jest.fn().mockResolvedValue({
      config: { low_min: 0.8, low_max: 1.3, medium_max: 1.5 },
      scope: 'global',
    }),
  }
  const scopes = new DashboardScopeService(
    { query } as never,
    {
      findOne: jest.fn(({ where }: { where: { id_season: number } }) =>
        Promise.resolve(
          where.id_season === 4
            ? { id_season: 4, start_date: '2026-04-15', end_date: '2026-11-30' }
            : null,
        ),
      ),
    } as never,
    { exists: jest.fn().mockResolvedValue(true) } as never,
    { findAllAthleteIds: jest.fn().mockResolvedValue([1, 2, 3]) } as never,
    metrics,
  )
  const readiness = {
    evaluate: jest.fn().mockResolvedValue({ ready: false, criteria: [] }),
  }
  const service = new DashboardService(scopes, acwr as never, metrics)
  const insights = new DashboardInsightsService(
    scopes,
    metrics,
    acwr as never,
    readiness as never,
    readiness as never,
  )
  return { service, insights, query }
}

const athlete = { id_user: 7, role: { name: 'DEPORTISTA' } } as User
const coach = { id_user: 2, role: { name: 'ENTRENADOR' } } as User

describe('DashboardService', () => {
  it('limits the athlete to their own data', async () => {
    const { service, query } = build()
    const result = await service.getOverview({}, athlete)
    for (const [, params] of query.mock.calls as [string, unknown[]][])
      expect(params).toContainEqual([7])
    expect(result.dashboard.filters.own_data_only).toBe(true)
  })

  it('uses every athlete for staff without filters', async () => {
    const { service, query } = build()
    await service.getOverview({}, coach)
    const [, params] = query.mock.calls[0] as [string, unknown[]]
    expect(params).toContainEqual([1, 2, 3])
  })

  it('reports insufficient data instead of zeros when there are no loads', async () => {
    const { service } = build()
    const result = await service.getOverview({}, coach)
    expect(result.dashboard.load.avg_session_load).toBeNull()
    expect(result.dashboard.load.avg_rpe).toBeNull()
    expect(result.dashboard.warnings.join(' ')).toContain(
      'No hay cargas registradas',
    )
  })

  it('rejects an unknown season', async () => {
    const { service } = build()
    await expect(
      service.getOverview({ id_season: 99 }, coach),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('returns no categories when no season contains the period', async () => {
    const { service } = build()
    const result = await service.getByCategory({}, coach)
    expect(result.dashboard.season).toBeNull()
    expect(result.dashboard.categories).toEqual([])
    expect(result.dashboard.warnings[0]).toContain('Datos insuficientes')
  })

  it('returns no RPE coverage for a category without expected loads', async () => {
    const query = jest.fn((sql: string) => {
      if (sql.includes('FROM seasons'))
        return Promise.resolve([
          { id_season: 4, name: '2026-2', status: 'active' },
        ])
      if (sql.includes('assigned AS'))
        return Promise.resolve([
          {
            id_category: 1,
            name: 'Sub-20',
            athletes: '0',
            sessions: '3',
            expected_loads: '0',
            registered_loads: '0',
            avg_load: null,
            avg_rpe: null,
            open_alerts: '0',
            athletes_at_risk: '0',
            injuries: '0',
            avg_progress: null,
            progress_athletes: '0',
            open_talent_flags: '0',
          },
        ])
      return Promise.resolve([])
    })
    const { service } = build(query)
    const result = await service.getByCategory({ id_season: 4 }, coach)
    expect(result.dashboard.categories[0]).toMatchObject({
      sessions: 3,
      rpe_coverage_pct: null,
      avg_session_load: null,
      avg_progress_index: null,
    })
  })

  it('ranks athletes at risk by their highest level and translates the rules', async () => {
    const query = jest.fn((sql: string) => {
      if (sql.includes('DISTINCT ON'))
        return Promise.resolve([
          {
            id_user: 5,
            name: 'Uno',
            lastname: 'Prueba',
            method: 'rules',
            risk_level: 'medio',
            date: '2026-10-20',
            triggered_rules: 'acwr_sostenido',
            acwr_value: '1.62',
          },
          {
            id_user: 6,
            name: 'Dos',
            lastname: 'Prueba',
            method: 'rules',
            risk_level: 'medio',
            date: '2026-10-28',
            triggered_rules: 'rpe_alto_sostenido',
            acwr_value: null,
          },
        ])
      if (sql.includes('GROUP BY ra.id_user'))
        return Promise.resolve([
          { id_user: 5, open_days: '4', peak: 2 },
          { id_user: 6, open_days: '1', peak: 1 },
        ])
      return Promise.resolve([])
    })
    const { service } = build(query)
    const result = await service.getInjuryRisk({}, coach)
    expect(result.dashboard.counts).toEqual({ alto: 1, medio: 1 })
    expect(result.dashboard.athletes[0]).toMatchObject({
      id_user: 5,
      risk_level: 'alto',
      open_days: 4,
      acwr: 1.62,
      factors: ['ACWR alto sostenido'],
    })
    expect(result.dashboard.warnings).toEqual([])
  })

  it('averages the progress index only over athletes whose base category is the row', async () => {
    const statements: string[] = []
    const query = jest.fn((sql: string) => {
      statements.push(sql)
      if (sql.includes('FROM seasons'))
        return Promise.resolve([
          { id_season: 4, name: '2026-2', status: 'active' },
        ])
      return Promise.resolve([])
    })
    const { service } = build(query)
    await service.getByCategory({ id_season: 4 }, coach)
    const sql = statements.find((text) => text.includes('assigned AS')) ?? ''
    expect(sql).toContain('DISTINCT ON (b.id_user, b.id_season)')
    expect(sql).toContain(
      'ORDER BY b.id_user, b.id_season, bc.max_age, b.id_ath_cat',
    )
    expect(sql).toContain('bc.id_category = c.id_category')
  })

  it('hides health records and consents from the coach', async () => {
    const { insights } = build()
    const result = await insights.getHealth({}, coach)
    expect(result.dashboard.health_records).toBeNull()
    expect(result.dashboard.consents).toBeNull()
    expect(
      result.dashboard.injuries_by_severity.map((row) => row.severity),
    ).toEqual(['leve', 'moderada', 'severa'])
  })

  it('shows health records and consents to the health officer', async () => {
    const { insights } = build()
    const officer = { id_user: 5, role: { name: 'ENCARGADO_SALUD' } } as User
    const result = await insights.getHealth({}, officer)
    expect(result.dashboard.health_records).toEqual([])
    expect(result.dashboard.consents).toMatchObject({ minors: 0 })
  })

  it('never sends talent flags to the athlete', async () => {
    const query = jest.fn((sql: string) =>
      Promise.resolve(
        sql.includes('FROM seasons')
          ? [{ id_season: 4, name: '2026-2', status: 'active' }]
          : [],
      ),
    )
    const { insights } = build(query)
    const result = await insights.getDevelopment({ id_season: 4 }, athlete)
    expect(result.dashboard.talent_flags).toBeNull()
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('FROM talent_flags'),
      ),
    ).toBe(false)
    expect(result.dashboard.progress?.index_value).toBeNull()
  })

  it('returns empty series without inventing values when there is no data', async () => {
    const { insights } = build()
    const training = await insights.getTraining({}, coach)
    expect(
      training.dashboard.by_type.every((row) => row.avg_session_load === null),
    ).toBe(true)
    expect(training.dashboard.warnings[0]).toContain('Datos insuficientes')
    const matches = await insights.getMatches({}, coach)
    expect(matches.dashboard.totals.avg_rpe).toBeNull()
    const ml = await insights.getMl({}, coach)
    expect(ml.dashboard.probability_distribution).toEqual([])
    expect(ml.dashboard.warnings.join(' ')).toContain('sintéticos')
  })
})
