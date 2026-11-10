import { Injectable } from '@nestjs/common'
import { AcwrConfigService } from 'src/acwr_config/acwr-config.service'
import { InjuryRiskRuleConfigService } from 'src/injury_risk_rule_config/injury-risk-rule-config.service'
import { ROLE_IDS } from 'src/roles/role-codes'
import { TalentRuleConfigService } from 'src/talent_rule_config/talent-rule-config.service'
import { User } from 'src/users/entities/user.entity'
import { DashboardScopeService } from './dashboard-scope.service'
import { Row, num, roundOrNull, str } from './dashboard-sql.util'
import { DashboardQueryDto } from './dto/dashboard-query.dto'

const USERS_ROLES = new Set(['ADMIN'])
const DEVELOPMENT_ROLES = new Set(['ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR'])
const ML_ROLES = new Set(['ADMIN', 'DIRECTOR_TECNICO', 'ENCARGADO_SALUD'])

const ROLE_ORDER = [
  'ADMIN',
  'DIRECTOR_TECNICO',
  'ENTRENADOR',
  'ENCARGADO_SALUD',
  'DEPORTISTA',
]

const MODEL_TASKS = ['talent', 'injury_risk'] as const

function roleOf(user: User): string {
  if (user.role?.name) return user.role.name
  const entry = Object.entries(ROLE_IDS).find(([, id]) => id === user.id_role)
  return entry ? entry[0] : ''
}

function parseJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object')
    return value as Record<string, unknown>
  if (typeof value !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export interface SummaryModelRow {
  task: string
  version: string
  algorithm: string
  pr_auc: number | null
  rules_pr_auc: number | null
}

export function compareWithRules(model: SummaryModelRow) {
  const beatsRules =
    model.pr_auc === null || model.rules_pr_auc === null
      ? null
      : model.pr_auc > model.rules_pr_auc
  return { ...model, beats_rules: beatsRules }
}

export function countByRole(rows: Row[]) {
  const totals = new Map(rows.map((row) => [String(row.role), num(row.total)]))
  const known = ROLE_ORDER.map((role) => ({
    role,
    total: totals.get(role) ?? 0,
  }))
  const others = [...totals.entries()]
    .filter(([role]) => !ROLE_ORDER.includes(role))
    .map(([role, total]) => ({ role, total }))
  const byRole = [...known, ...others]
  return {
    total: byRole.reduce((sum, item) => sum + item.total, 0),
    by_role: byRole,
  }
}

export function countFlags(rows: Row[]) {
  const sum = (filter: (row: Row) => boolean) =>
    rows.filter(filter).reduce((total, row) => total + num(row.total), 0)
  return {
    total: sum(() => true),
    open: sum((row) => row.status === 'open'),
    rules: sum((row) => row.source === 'rules'),
    ml: sum((row) => row.source === 'ml'),
    manual: sum((row) => row.source === 'manual'),
  }
}

@Injectable()
export class DashboardSummaryService {
  constructor(
    private readonly scopes: DashboardScopeService,
    private readonly acwrConfigService: AcwrConfigService,
    private readonly injuryRiskRuleConfigService: InjuryRiskRuleConfigService,
    private readonly talentRuleConfigService: TalentRuleConfigService,
  ) {}

  private query<T = Row>(sql: string, params: unknown[]): Promise<T[]> {
    return this.scopes.query<T>(sql, params)
  }

  async getSummary(query: DashboardQueryDto, user: User) {
    const scope = await this.scopes.resolveScope(
      { id_season: query.id_season, id_category: query.id_category },
      user,
    )
    const role = roleOf(user)
    const [seasonRow] = scope.id_season
      ? await this.query(
          `SELECT name, to_char(start_date, 'YYYY-MM-DD') AS start_date,
                  to_char(COALESCE(end_date, CURRENT_DATE), 'YYYY-MM-DD') AS end_date
           FROM seasons WHERE id_season = $1`,
          [scope.id_season],
        )
      : []
    const [categoryRow] = scope.id_category
      ? await this.query('SELECT name FROM categories WHERE id_category = $1', [
          scope.id_category,
        ])
      : []
    const from = seasonRow ? str(seasonRow.start_date) : null
    const to = seasonRow ? str(seasonRow.end_date) : null
    const params = [from, to, scope.athleteIds]
    const dateFilter = (column: string) =>
      `($1::date IS NULL OR ${column} BETWEEN $1::date AND $2::date)`

    const [
      categories,
      sessions,
      loads,
      matches,
      injuries,
      alerts,
      assessments,
      seasonsTotal,
    ] = await Promise.all([
      this.query(
        `SELECT COUNT(DISTINCT a.id_category) AS total
         FROM athletes_in_categories a
         WHERE a.id_user = ANY($1::int[])
           AND ($2::int IS NULL OR a.id_season = $2)
           AND ($3::int IS NULL OR a.id_category = $3)`,
        [scope.athleteIds, scope.id_season, scope.id_category],
      ),
      this.query(
        `SELECT COUNT(*) AS total
         FROM training_sessions s
         WHERE ($1::int IS NULL OR s.id_season = $1)
           AND ($2::int IS NULL OR s.id_category = $2)`,
        [scope.id_season, scope.id_category],
      ),
      this.query(
        `SELECT COUNT(*) AS total, COUNT(DISTINCT l.id_user) AS athletes,
                AVG(l.rpe) AS avg_rpe, AVG(l.session_load) AS avg_load
         FROM training_loads l
         JOIN training_sessions s ON s.id_session = l.id_session
         WHERE l.id_user = ANY($1::int[])
           AND ($2::int IS NULL OR s.id_season = $2)
           AND ($3::int IS NULL OR s.id_category = $3)`,
        [scope.athleteIds, scope.id_season, scope.id_category],
      ),
      this.query(
        `SELECT COUNT(*) AS total
         FROM matches m
         WHERE ${dateFilter('m.date')}
           AND ($3::int IS NULL OR m.id_category = $3)`,
        [from, to, scope.id_category],
      ),
      this.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE i.mechanism = 'sin_contacto') AS non_contact,
                COUNT(*) FILTER (WHERE i.mechanism = 'contacto') AS contact,
                COUNT(*) FILTER (WHERE i.status IN ('active', 'recovering')) AS active
         FROM injuries i
         WHERE i.id_user = ANY($3::int[]) AND ${dateFilter('i.injury_date')}`,
        params.slice(0, 3),
      ),
      this.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE fa.level = 'alto') AS alto,
                COUNT(*) FILTER (WHERE fa.level = 'medio') AS medio,
                COUNT(*) FILTER (WHERE fa.level = 'bajo') AS bajo,
                COUNT(*) FILTER (WHERE fa.status = 'open') AS open
         FROM fatigue_alerts fa
         WHERE fa.id_user = ANY($3::int[]) AND ${dateFilter('fa.date')}`,
        params.slice(0, 3),
      ),
      this.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE ra.risk_level = 'alto') AS alto,
                COUNT(*) FILTER (WHERE ra.risk_level = 'medio') AS medio,
                COUNT(*) FILTER (WHERE ra.status = 'open') AS open
         FROM injury_risk_assessments ra
         WHERE ra.id_user = ANY($3::int[]) AND ${dateFilter('ra.assessment_date')}`,
        params.slice(0, 3),
      ),
      this.query('SELECT COUNT(*) AS total FROM seasons', []),
    ])

    const [acwr, riskRules] = await Promise.all([
      this.acwrConfigService.getActive(scope.id_category),
      this.injuryRiskRuleConfigService.getActive(scope.id_category),
    ])
    const users = USERS_ROLES.has(role) ? await this.usersByRole() : null
    const development = DEVELOPMENT_ROLES.has(role)
      ? await this.development(
          scope.athleteIds,
          scope.id_season,
          scope.id_category,
        )
      : null
    const ml = ML_ROLES.has(role) ? await this.ml() : null

    const loadRow = loads[0] ?? {}
    const injuryRow = injuries[0] ?? {}
    const alertRow = alerts[0] ?? {}
    const assessmentRow = assessments[0] ?? {}
    const warnings: string[] = []
    if (num(loadRow.total) === 0)
      warnings.push(
        'Datos insuficientes: no hay cargas de RPE registradas en este alcance',
      )
    if (num(alertRow.total) > 0 && num(alertRow.open) === num(alertRow.total))
      warnings.push(
        'Ninguna alerta de fatiga se ha revisado: todas siguen abiertas',
      )

    return {
      status: 'Success',
      mensaje: 'Resumen general del club generado con éxito',
      dashboard: {
        filters: {
          id_season: scope.id_season,
          id_category: scope.id_category,
          season_name: seasonRow ? str(seasonRow.name) : null,
          category_name: categoryRow ? str(categoryRow.name) : null,
          from,
          to,
          all_history: !scope.id_season && !scope.id_category,
        },
        users,
        records: {
          athletes: scope.athleteIds.length,
          athletes_with_load: num(loadRow.athletes),
          categories: num(categories[0]?.total),
          seasons: scope.id_season ? 1 : num(seasonsTotal[0]?.total),
          sessions: num(sessions[0]?.total),
          rpe_loads: num(loadRow.total),
          matches: num(matches[0]?.total),
          injuries: num(injuryRow.total),
          non_contact_injuries: num(injuryRow.non_contact),
          contact_injuries: num(injuryRow.contact),
          active_injuries: num(injuryRow.active),
        },
        load: {
          avg_rpe: roundOrNull(loadRow.avg_rpe, 1),
          avg_session_load: roundOrNull(loadRow.avg_load, 1),
          acwr_thresholds: {
            low_min: Number(acwr.config.low_min),
            low_max: Number(acwr.config.low_max),
            medium_max: Number(acwr.config.medium_max),
          },
        },
        fatigue_alerts: {
          total: num(alertRow.total),
          alto: num(alertRow.alto),
          medio: num(alertRow.medio),
          bajo: num(alertRow.bajo),
          open: num(alertRow.open),
        },
        risk_assessments: {
          total: num(assessmentRow.total),
          alto: num(assessmentRow.alto),
          medio: num(assessmentRow.medio),
          open: num(assessmentRow.open),
        },
        risk_rules: {
          acwr_threshold: Number(riskRules.config.sustained_acwr_threshold),
          acwr_min_days: Number(riskRules.config.sustained_acwr_min_days),
          acwr_lookback_days: Number(
            riskRules.config.sustained_acwr_lookback_days,
          ),
          rpe_threshold: Number(riskRules.config.sustained_rpe_threshold),
          rpe_min_sessions: Number(riskRules.config.sustained_rpe_min_sessions),
          rpe_lookback_days: Number(
            riskRules.config.sustained_rpe_lookback_days,
          ),
        },
        development,
        ml,
        warnings,
      },
    }
  }

  private async usersByRole() {
    const rows = await this.query(
      `SELECT r.name AS role, COUNT(u.id_user) AS total
       FROM roles r LEFT JOIN users u ON u.id_role = r.id_role
       GROUP BY r.name`,
      [],
    )
    return countByRole(rows)
  }

  private async development(
    athleteIds: number[],
    idSeason: number | null,
    idCategory: number | null,
  ) {
    const [seasonRow] = await this.query(
      `SELECT w.id_season, s.name
       FROM weighted_progress_indices w
       JOIN seasons s ON s.id_season = w.id_season
       WHERE w.id_user = ANY($1::int[])
         AND ($2::int IS NULL OR w.id_season = $2)
       GROUP BY w.id_season, s.name, s.start_date
       ORDER BY s.start_date DESC
       LIMIT 1`,
      [athleteIds, idSeason],
    )
    const progressSeason = seasonRow ? Number(seasonRow.id_season) : null
    const [averages, top, flags, talentRules] = await Promise.all([
      progressSeason
        ? this.query(
            `SELECT COUNT(*) AS athletes, AVG(w.index_value) AS index_value,
                    AVG(w.physical_score) AS physical, AVG(w.technical_score) AS technical,
                    AVG(w.tactical_score) AS tactical, AVG(w.participation_score) AS participation
             FROM weighted_progress_indices w
             WHERE w.id_season = $1 AND w.id_user = ANY($2::int[])`,
            [progressSeason, athleteIds],
          )
        : Promise.resolve([] as Row[]),
      progressSeason
        ? this.query(
            `SELECT w.id_user, w.index_value, w.physical_score, w.technical_score,
                    w.tactical_score, w.participation_score,
                    p.position, p.age_category
             FROM weighted_progress_indices w
             LEFT JOIN position_weight_profiles p ON p.id_profile = w.id_profile
             WHERE w.id_season = $1 AND w.id_user = ANY($2::int[])
             ORDER BY w.index_value DESC, w.id_user
             LIMIT 1`,
            [progressSeason, athleteIds],
          )
        : Promise.resolve([] as Row[]),
      this.query(
        `SELECT t.source, t.status, COUNT(*) AS total
         FROM talent_flags t
         WHERE t.id_user = ANY($1::int[])
           AND ($2::int IS NULL OR t.id_season = $2)
         GROUP BY 1, 2`,
        [athleteIds, idSeason],
      ),
      this.talentRuleConfigService.getActive(idCategory),
    ])
    const avg = averages[0] ?? {}
    const best = top[0]
    const dimensions = (row: Row, keys: [string, string, string, string]) => ({
      physical: roundOrNull(row[keys[0]], 1),
      technical: roundOrNull(row[keys[1]], 1),
      tactical: roundOrNull(row[keys[2]], 1),
      participation: roundOrNull(row[keys[3]], 1),
    })
    return {
      progress: progressSeason
        ? {
            id_season: progressSeason,
            season_name: str(seasonRow.name),
            athletes: num(avg.athletes),
            average: {
              index_value: roundOrNull(avg.index_value, 1),
              ...dimensions(avg, [
                'physical',
                'technical',
                'tactical',
                'participation',
              ]),
            },
            top: best
              ? {
                  id_user: Number(best.id_user),
                  index_value: roundOrNull(best.index_value, 1),
                  position: str(best.position),
                  category: str(best.age_category),
                  ...dimensions(best, [
                    'physical_score',
                    'technical_score',
                    'tactical_score',
                    'participation_score',
                  ]),
                }
              : null,
          }
        : null,
      talent_flags: countFlags(flags),
      talent_rules: {
        min_percentile: Number(talentRules.config.min_percentile),
        min_dimension_score: Number(talentRules.config.min_dimension_score),
        min_improvement_delta: Number(talentRules.config.min_improvement_delta),
        min_participation_score: Number(
          talentRules.config.min_participation_score,
        ),
      },
    }
  }

  private async ml() {
    const [engineRows, modelRows] = await Promise.all([
      this.query(
        'SELECT engine, talent_engine FROM ml_engine_configs ORDER BY id_config LIMIT 1',
        [],
      ),
      this.query(
        `SELECT task, version, algorithm, metrics, rules_baseline_metrics
         FROM ml_models WHERE is_active = true ORDER BY created_at DESC`,
        [],
      ),
    ])
    const engine = engineRows[0]
    const models = MODEL_TASKS.map((task) => {
      const row = modelRows.find((item) => item.task === task)
      if (!row) return null
      return compareWithRules({
        task,
        version: String(row.version),
        algorithm: String(row.algorithm),
        pr_auc: roundOrNull(parseJson(row.metrics).pr_auc, 3),
        rules_pr_auc: roundOrNull(
          parseJson(row.rules_baseline_metrics).pr_auc,
          3,
        ),
      })
    }).filter((model) => model !== null)
    return {
      engine: engine ? String(engine.engine) : 'rules',
      talent_engine: engine ? String(engine.talent_engine) : 'rules',
      models,
    }
  }
}
