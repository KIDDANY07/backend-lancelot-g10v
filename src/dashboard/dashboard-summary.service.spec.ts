import { User } from 'src/users/entities/user.entity'
import { DashboardMetricsService } from './dashboard-metrics.service'
import { DashboardScopeService } from './dashboard-scope.service'
import {
  DashboardSummaryService,
  compareWithRules,
  countByRole,
  countFlags,
} from './dashboard-summary.service'

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}))
jest.mock('src/users/users.service', () => ({ UsersService: class {} }))
jest.mock('src/acwr_config/acwr-config.service', () => ({
  AcwrConfigService: class {},
}))
jest.mock(
  'src/injury_risk_rule_config/injury-risk-rule-config.service',
  () => ({ InjuryRiskRuleConfigService: class {} }),
)
jest.mock('src/talent_rule_config/talent-rule-config.service', () => ({
  TalentRuleConfigService: class {},
}))

function answer(sql: string): Record<string, unknown>[] {
  if (sql.includes('FROM roles r'))
    return [
      { role: 'ADMIN', total: '1' },
      { role: 'DEPORTISTA', total: '15' },
      { role: 'ENTRENADOR', total: '1' },
    ]
  if (sql.includes('FROM training_loads'))
    return [{ total: '0', athletes: '0', avg_rpe: null, avg_load: null }]
  if (sql.includes('FROM fatigue_alerts'))
    return [{ total: '3', alto: '2', medio: '1', bajo: '0', open: '3' }]
  if (sql.includes('FROM ml_models'))
    return [
      {
        task: 'injury_risk',
        version: 'lr-1',
        algorithm: 'logistic_regression',
        metrics: '{"pr_auc": 0.0449}',
        rules_baseline_metrics: '{"pr_auc": 0.0683}',
      },
    ]
  if (sql.includes('FROM ml_engine_configs'))
    return [{ engine: 'shadow', talent_engine: 'ml' }]
  return [{ total: '0' }]
}

function build() {
  const query = jest.fn((sql: string) => Promise.resolve(answer(sql)))
  const metrics = new DashboardMetricsService()
  const scopes = new DashboardScopeService(
    { query } as never,
    { findOne: jest.fn().mockResolvedValue(null) } as never,
    { exists: jest.fn().mockResolvedValue(true) } as never,
    { findAllAthleteIds: jest.fn().mockResolvedValue([1, 2, 3]) } as never,
    metrics,
  )
  const config = (values: Record<string, number>) => ({
    getActive: jest.fn().mockResolvedValue({ config: values, scope: 'global' }),
  })
  const service = new DashboardSummaryService(
    scopes,
    config({ low_min: 0.8, low_max: 1.3, medium_max: 1.5 }) as never,
    config({
      sustained_acwr_threshold: 1.5,
      sustained_acwr_min_days: 2,
      sustained_acwr_lookback_days: 7,
      sustained_rpe_threshold: 8,
      sustained_rpe_min_sessions: 3,
      sustained_rpe_lookback_days: 14,
    }) as never,
    config({
      min_percentile: 80,
      min_dimension_score: 40,
      min_improvement_delta: 5,
      min_participation_score: 50,
    }) as never,
  )
  return { service, query }
}

const as = (role: string) => ({ id_user: 9, role: { name: role } }) as User

describe('DashboardSummaryService', () => {
  it('covers the whole history when no filter is given', async () => {
    const { service } = build()
    const { dashboard } = await service.getSummary({}, as('ADMIN'))
    expect(dashboard.filters.all_history).toBe(true)
    expect(dashboard.filters.from).toBeNull()
    expect(dashboard.records.athletes).toBe(3)
    expect(dashboard.risk_rules.acwr_threshold).toBe(1.5)
    expect(dashboard.load.acwr_thresholds.medium_max).toBe(1.5)
  })

  it('returns null instead of zero when there is no RPE', async () => {
    const { service } = build()
    const { dashboard } = await service.getSummary({}, as('ADMIN'))
    expect(dashboard.load.avg_rpe).toBeNull()
    expect(dashboard.load.avg_session_load).toBeNull()
    expect(dashboard.warnings[0]).toContain('Datos insuficientes')
  })

  it('shows users by role only to ADMIN', async () => {
    const { service } = build()
    const admin = await service.getSummary({}, as('ADMIN'))
    expect(admin.dashboard.users?.total).toBe(17)
    const coach = await service.getSummary({}, as('ENTRENADOR'))
    expect(coach.dashboard.users).toBeNull()
  })

  it('keeps development and ML for the roles that already see them', async () => {
    const { service } = build()
    const health = await service.getSummary({}, as('ENCARGADO_SALUD'))
    expect(health.dashboard.development).toBeNull()
    expect(health.dashboard.ml?.models[0].beats_rules).toBe(false)
    const coach = await service.getSummary({}, as('ENTRENADOR'))
    expect(coach.dashboard.ml).toBeNull()
    expect(coach.dashboard.development?.talent_rules.min_percentile).toBe(80)
  })
})

describe('summary helpers', () => {
  it('orders roles and keeps unknown ones', () => {
    const result = countByRole([
      { role: 'DEPORTISTA', total: '15' },
      { role: 'OTRO', total: '2' },
    ])
    expect(result.by_role.map((item) => item.role)).toEqual([
      'ADMIN',
      'DIRECTOR_TECNICO',
      'ENTRENADOR',
      'ENCARGADO_SALUD',
      'DEPORTISTA',
      'OTRO',
    ])
    expect(result.total).toBe(17)
  })

  it('counts talent flags by source and status', () => {
    expect(
      countFlags([
        { source: 'ml', status: 'open', total: '32' },
        { source: 'rules', status: 'open', total: '17' },
        { source: 'manual', status: 'reviewed', total: '1' },
      ]),
    ).toEqual({ total: 50, open: 49, rules: 17, ml: 32, manual: 1 })
  })

  it('does not compare a model without metrics', () => {
    const base = { task: 'talent', version: 'v', algorithm: 'lr' }
    expect(
      compareWithRules({ ...base, pr_auc: 0.77, rules_pr_auc: 0.63 })
        .beats_rules,
    ).toBe(true)
    expect(
      compareWithRules({ ...base, pr_auc: null, rules_pr_auc: 0.63 })
        .beats_rules,
    ).toBeNull()
  })
})
