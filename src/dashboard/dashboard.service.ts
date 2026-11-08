import { Injectable } from '@nestjs/common'
import { AcwrConfigService } from 'src/acwr_config/acwr-config.service'
import { User } from 'src/users/entities/user.entity'
import { ruleLabel } from './dashboard-labels'
import {
  AcwrAggregateRow,
  DashboardMetricsService,
  LoadAggregateRow,
  RISK_LEVEL_ORDER,
} from './dashboard-metrics.service'
import { DashboardScopeService } from './dashboard-scope.service'
import { Row, fullName, num, roundOrNull, str } from './dashboard-sql.util'
import { DashboardQueryDto } from './dto/dashboard-query.dto'

@Injectable()
export class DashboardService {
  constructor(
    private readonly scopes: DashboardScopeService,
    private readonly acwrConfigService: AcwrConfigService,
    private readonly metrics: DashboardMetricsService,
  ) {}

  private query<T = Row>(sql: string, params: unknown[]): Promise<T[]> {
    return this.scopes.query<T>(sql, params)
  }

  async getOverview(query: DashboardQueryDto, user: User) {
    const scope = await this.scopes.resolveScope(query, user)
    const params = this.scopes.baseParams(scope)
    const { config: thresholds } = await this.acwrConfigService.getActive(
      scope.id_category,
    )
    const lowMin = Number(thresholds.low_min)
    const sessionAthleteClause = scope.isAthlete
      ? `AND EXISTS (SELECT 1 FROM athletes_in_categories a
           WHERE a.id_user = ANY($3::int[]) AND a.id_category = s.id_category AND a.id_season = s.id_season)`
      : 'AND $3::int[] IS NOT NULL'

    const [sessions, loads, alerts, injuries, freshness, matches] =
      await Promise.all([
        this.query(
          `SELECT COUNT(*) AS total
         FROM training_sessions s
         WHERE s.date BETWEEN $1 AND $2
           AND ($4::int IS NULL OR s.id_season = $4)
           AND ($5::int IS NULL OR s.id_category = $5)
           ${sessionAthleteClause}`,
          params,
        ),
        this.query(
          `SELECT COUNT(*) AS loads,
                COUNT(DISTINCT l.id_user) AS athletes,
                AVG(l.session_load) AS avg_load,
                AVG(l.rpe) AS avg_rpe
         FROM training_loads l
         JOIN training_sessions s ON s.id_session = l.id_session
         WHERE s.date BETWEEN $1 AND $2
           AND l.id_user = ANY($3::int[])
           AND ($4::int IS NULL OR s.id_season = $4)
           AND ($5::int IS NULL OR s.id_category = $5)`,
          params,
        ),
        this.query(
          `SELECT COUNT(*) AS open_alerts,
                COUNT(*) FILTER (WHERE fa.acwr_value < $4) AS underload,
                COUNT(*) FILTER (WHERE fa.acwr_value >= $4) AS overload,
                COUNT(DISTINCT fa.id_user) AS athletes
         FROM fatigue_alerts fa
         WHERE fa.status = 'open'
           AND fa.date BETWEEN $1 AND $2
           AND fa.id_user = ANY($3::int[])`,
          [scope.period.from, scope.period.to, scope.athleteIds, lowMin],
        ),
        this.query(
          `SELECT COUNT(*) FILTER (WHERE i.status IN ('active', 'recovering')) AS active,
                COUNT(*) FILTER (WHERE i.status = 'recovering') AS recovering,
                COUNT(*) FILTER (WHERE i.injury_date BETWEEN $1 AND $2) AS in_period
         FROM injuries i
         WHERE i.id_user = ANY($3::int[])`,
          params.slice(0, 3),
        ),
        this.query(
          `SELECT to_char(MAX(s.date), 'YYYY-MM-DD') AS last_load_date
         FROM training_loads l
         JOIN training_sessions s ON s.id_session = l.id_session
         WHERE l.id_user = ANY($1::int[])`,
          [scope.athleteIds],
        ),
        this.query(
          `SELECT COUNT(DISTINCT m.id_match) AS total
         FROM matches m
         WHERE m.date BETWEEN $1 AND $2
           AND ($4::int IS NULL OR m.id_category = $4)
           AND ${
             scope.isAthlete
               ? 'EXISTS (SELECT 1 FROM match_statistics x WHERE x.id_match = m.id_match AND x.id_user = ANY($3::int[]))'
               : '$3::int[] IS NOT NULL'
           }`,
          [
            scope.period.from,
            scope.period.to,
            scope.athleteIds,
            scope.id_category,
          ],
        ),
      ])

    const loadRow = loads[0] ?? {}
    const alertRow = alerts[0] ?? {}
    const injuryRow = injuries[0] ?? {}
    const lastLoad = str(freshness[0]?.last_load_date)
    const warnings: string[] = []
    if (!lastLoad) warnings.push('No hay cargas registradas para este alcance')
    else if (lastLoad < scope.period.to)
      warnings.push(
        `La última carga registrada es del ${lastLoad}: los días posteriores no tienen datos de RPE`,
      )

    return {
      status: 'Success',
      mensaje: 'Resumen del tablero generado con éxito',
      dashboard: {
        filters: this.scopes.filters(scope),
        athletes: {
          in_scope: scope.athleteIds.length,
          with_load: num(loadRow.athletes),
        },
        sessions: { total: num(sessions[0]?.total) },
        matches: { total: num(matches[0]?.total) },
        load: {
          loads: num(loadRow.loads),
          avg_session_load: roundOrNull(loadRow.avg_load, 1),
          avg_rpe: roundOrNull(loadRow.avg_rpe, 1),
        },
        fatigue_alerts: {
          open: num(alertRow.open_alerts),
          underload: num(alertRow.underload),
          overload: num(alertRow.overload),
          athletes: num(alertRow.athletes),
        },
        injuries: {
          active: num(injuryRow.active),
          recovering: num(injuryRow.recovering),
          in_period: num(injuryRow.in_period),
        },
        last_load_date: lastLoad,
        warnings,
      },
    }
  }

  async getLoad(query: DashboardQueryDto, user: User) {
    const scope = await this.scopes.resolveScope(query, user)
    const granularity = this.metrics.granularityFor(scope.period)
    const trunc = granularity === 'day' ? 'day' : 'week'
    const { config: thresholds, scope: thresholdScope } =
      await this.acwrConfigService.getActive(scope.id_category)
    const zones = {
      low_min: Number(thresholds.low_min),
      low_max: Number(thresholds.low_max),
      medium_max: Number(thresholds.medium_max),
    }
    const [loadRows, acwrRows] = await Promise.all([
      this.query<LoadAggregateRow>(
        `SELECT to_char(date_trunc('${trunc}', s.date), 'YYYY-MM-DD') AS period,
                COUNT(*) AS loads,
                COUNT(DISTINCT l.id_user) AS athletes,
                SUM(l.session_load) AS total_load,
                AVG(l.rpe) AS avg_rpe
         FROM training_loads l
         JOIN training_sessions s ON s.id_session = l.id_session
         WHERE s.date BETWEEN $1 AND $2
           AND l.id_user = ANY($3::int[])
           AND ($4::int IS NULL OR s.id_season = $4)
           AND ($5::int IS NULL OR s.id_category = $5)
         GROUP BY 1 ORDER BY 1`,
        this.scopes.baseParams(scope),
      ),
      this.query<AcwrAggregateRow>(
        `SELECT to_char(date_trunc('${trunc}', f.date), 'YYYY-MM-DD') AS period,
                AVG(f.acwr) AS acwr_avg,
                COUNT(DISTINCT f.id_user) FILTER (WHERE f.acwr IS NOT NULL) AS athletes,
                COUNT(*) FILTER (WHERE f.acwr < $4) AS underload,
                COUNT(*) FILTER (WHERE f.acwr >= $4 AND f.acwr <= $5) AS optimal,
                COUNT(*) FILTER (WHERE f.acwr > $5 AND f.acwr <= $6) AS caution,
                COUNT(*) FILTER (WHERE f.acwr > $6) AS overload
         FROM athlete_daily_features f
         WHERE f.date BETWEEN $1 AND $2 AND f.id_user = ANY($3::int[])
         GROUP BY 1 ORDER BY 1`,
        [
          scope.period.from,
          scope.period.to,
          scope.athleteIds,
          zones.low_min,
          zones.low_max,
          zones.medium_max,
        ],
      ),
    ])
    const series = this.metrics.buildLoadSeries(
      this.metrics.periodKeys(scope.period, granularity),
      loadRows,
      acwrRows,
    )
    const warnings: string[] = []
    if (!series.some((point) => point.loads > 0))
      warnings.push('Datos insuficientes: no hay cargas de RPE en el periodo')
    return {
      status: 'Success',
      mensaje: 'Serie de carga generada con éxito',
      dashboard: {
        filters: this.scopes.filters(scope),
        granularity,
        zones: { ...zones, scope: thresholdScope },
        series,
        warnings,
      },
    }
  }

  async getByCategory(query: DashboardQueryDto, user: User) {
    const scope = await this.scopes.resolveScope(query, user)
    const season = await this.scopes.seasonForScope(scope)
    if (!season)
      return {
        status: 'Success',
        mensaje: 'Resumen por categoría generado con éxito',
        dashboard: {
          filters: this.scopes.filters(scope),
          season: null,
          categories: [],
          warnings: [
            'Datos insuficientes: no hay una temporada que contenga la fecha final del periodo',
          ],
        },
      }
    const rows = await this.query(
      `WITH base_category AS (
         SELECT DISTINCT ON (b.id_user, b.id_season) b.id_user, b.id_season, b.id_category
         FROM athletes_in_categories b
         JOIN categories bc ON bc.id_category = b.id_category
         WHERE b.id_season IS NOT NULL
         ORDER BY b.id_user, b.id_season, bc.max_age, b.id_ath_cat
       ),
       assigned AS (
         SELECT DISTINCT a.id_category, a.id_user
         FROM athletes_in_categories a
         JOIN users u ON u.id_user = a.id_user
         JOIN roles r ON r.id_role = u.id_role AND r.code = 'DEPORTISTA'
         WHERE a.id_season = $1 AND ($2::int IS NULL OR a.id_category = $2)
       ),
       sess AS (
         SELECT s.id_session, s.id_category
         FROM training_sessions s
         WHERE s.id_season = $1
           AND ($2::int IS NULL OR s.id_category = $2)
           AND s.date BETWEEN $3 AND $4
       ),
       cats AS (
         SELECT id_category FROM assigned UNION SELECT id_category FROM sess
       )
       SELECT c.id_category, c.name,
         (SELECT COUNT(*) FROM assigned x WHERE x.id_category = c.id_category) AS athletes,
         (SELECT COUNT(*) FROM sess x WHERE x.id_category = c.id_category) AS sessions,
         (SELECT COUNT(*) FROM sess x JOIN assigned y ON y.id_category = x.id_category
            WHERE x.id_category = c.id_category) AS expected_loads,
         (SELECT COUNT(*) FROM training_loads l
            JOIN sess x ON x.id_session = l.id_session
            JOIN assigned y ON y.id_category = x.id_category AND y.id_user = l.id_user
            WHERE x.id_category = c.id_category) AS registered_loads,
         (SELECT AVG(l.session_load) FROM training_loads l
            JOIN sess x ON x.id_session = l.id_session
            WHERE x.id_category = c.id_category) AS avg_load,
         (SELECT AVG(l.rpe) FROM training_loads l
            JOIN sess x ON x.id_session = l.id_session
            WHERE x.id_category = c.id_category) AS avg_rpe,
         (SELECT COUNT(*) FROM fatigue_alerts fa
            WHERE fa.status = 'open' AND fa.date BETWEEN $3 AND $4
              AND fa.id_user IN (SELECT y.id_user FROM assigned y WHERE y.id_category = c.id_category)) AS open_alerts,
         (SELECT COUNT(DISTINCT ra.id_user) FROM injury_risk_assessments ra
            WHERE ra.status = 'open' AND ra.risk_level IN ('medio', 'alto')
              AND ra.assessment_date BETWEEN $3 AND $4
              AND ra.id_user IN (SELECT y.id_user FROM assigned y WHERE y.id_category = c.id_category)) AS athletes_at_risk,
         (SELECT COUNT(*) FROM injuries i
            WHERE i.injury_date BETWEEN $3 AND $4
              AND i.id_user IN (SELECT y.id_user FROM assigned y WHERE y.id_category = c.id_category)) AS injuries,
         (SELECT AVG(w.index_value) FROM weighted_progress_indices w
            JOIN base_category bc ON bc.id_user = w.id_user AND bc.id_season = w.id_season
            WHERE w.id_season = $1 AND bc.id_category = c.id_category) AS avg_progress,
         (SELECT COUNT(*) FROM weighted_progress_indices w
            JOIN base_category bc ON bc.id_user = w.id_user AND bc.id_season = w.id_season
            WHERE w.id_season = $1 AND bc.id_category = c.id_category) AS progress_athletes,
         (SELECT COUNT(*) FROM talent_flags t
            WHERE t.id_season = $1 AND t.status = 'open'
              AND t.id_user IN (SELECT y.id_user FROM assigned y WHERE y.id_category = c.id_category)) AS open_talent_flags
       FROM categories c
       JOIN cats ON cats.id_category = c.id_category
       ORDER BY c.min_age, c.id_category`,
      [
        Number(season.id_season),
        scope.id_category,
        scope.period.from,
        scope.period.to,
      ],
    )
    const categories = rows.map((row) => ({
      id_category: Number(row.id_category),
      name: String(row.name),
      athletes: num(row.athletes),
      sessions: num(row.sessions),
      avg_session_load: roundOrNull(row.avg_load, 1),
      avg_rpe: roundOrNull(row.avg_rpe, 1),
      rpe_coverage_pct: this.metrics.coverage(
        num(row.registered_loads),
        num(row.expected_loads),
      ),
      open_alerts: num(row.open_alerts),
      athletes_at_risk: num(row.athletes_at_risk),
      injuries: num(row.injuries),
      avg_progress_index: roundOrNull(row.avg_progress, 1),
      progress_athletes: num(row.progress_athletes),
      open_talent_flags: num(row.open_talent_flags),
    }))
    const warnings: string[] = []
    if (categories.length === 0)
      warnings.push(
        'Datos insuficientes: la temporada no tiene deportistas asignados ni sesiones',
      )
    return {
      status: 'Success',
      mensaje: 'Resumen por categoría generado con éxito',
      dashboard: {
        filters: this.scopes.filters(scope),
        season: {
          id_season: Number(season.id_season),
          name: String(season.name),
          status: String(season.status),
        },
        categories,
        definitions: {
          rpe_coverage_pct:
            'Cargas de RPE registradas entre las esperadas (una por deportista asignado en cada sesión de su categoría)',
          avg_progress_index:
            'Promedio del índice de progreso ponderado (0 a 100) de los deportistas cuya categoría base es esta (la de menor edad máxima entre sus asignaciones), igual que en Talento y progreso. Los invitados de otra categoría no se incluyen',
          athletes:
            'En deportistas, sesiones, alertas y lesiones, un deportista asignado a varias categorías cuenta en cada una',
        },
        warnings,
      },
    }
  }

  async getBySeason(query: DashboardQueryDto, user: User) {
    const scope = await this.scopes.resolveScope(query, user)
    const rows = await this.query(
      `WITH base_category AS (
         SELECT DISTINCT ON (b.id_user, b.id_season) b.id_user, b.id_season, b.id_category
         FROM athletes_in_categories b
         JOIN categories bc ON bc.id_category = b.id_category
         WHERE b.id_season IS NOT NULL
         ORDER BY b.id_user, b.id_season, bc.max_age, b.id_ath_cat
       ),
       assigned AS (
         SELECT DISTINCT a.id_season, a.id_user
         FROM athletes_in_categories a
         JOIN users u ON u.id_user = a.id_user
         JOIN roles r ON r.id_role = u.id_role AND r.code = 'DEPORTISTA'
         WHERE a.id_season IS NOT NULL AND ($1::int IS NULL OR a.id_category = $1)
       )
       SELECT se.id_season, se.name, se.status,
         to_char(se.start_date, 'YYYY-MM-DD') AS start_date,
         to_char(se.end_date, 'YYYY-MM-DD') AS end_date,
         (SELECT COUNT(*) FROM assigned x WHERE x.id_season = se.id_season) AS athletes,
         (SELECT COUNT(*) FROM training_sessions s
            WHERE s.id_season = se.id_season AND ($1::int IS NULL OR s.id_category = $1)) AS sessions,
         (SELECT COUNT(*) FROM matches m
            WHERE m.date BETWEEN se.start_date AND COALESCE(se.end_date, CURRENT_DATE)
              AND ($1::int IS NULL OR m.id_category = $1)) AS matches,
         (SELECT AVG(l.session_load) FROM training_loads l
            JOIN training_sessions s ON s.id_session = l.id_session
            WHERE s.id_season = se.id_season AND ($1::int IS NULL OR s.id_category = $1)) AS avg_load,
         (SELECT AVG(l.rpe) FROM training_loads l
            JOIN training_sessions s ON s.id_session = l.id_session
            WHERE s.id_season = se.id_season AND ($1::int IS NULL OR s.id_category = $1)) AS avg_rpe,
         (SELECT COUNT(*) FROM injuries i
            WHERE i.injury_date BETWEEN se.start_date AND COALESCE(se.end_date, CURRENT_DATE)
              AND i.id_user IN (SELECT x.id_user FROM assigned x WHERE x.id_season = se.id_season)) AS injuries,
         (SELECT AVG(w.index_value) FROM weighted_progress_indices w
            WHERE w.id_season = se.id_season
              AND ($1::int IS NULL OR EXISTS (
                SELECT 1 FROM base_category bc
                WHERE bc.id_user = w.id_user AND bc.id_season = w.id_season AND bc.id_category = $1))) AS avg_progress,
         (SELECT COUNT(*) FROM talent_flags t
            WHERE t.id_season = se.id_season
              AND t.id_user IN (SELECT x.id_user FROM assigned x WHERE x.id_season = se.id_season)) AS talent_flags
       FROM seasons se
       ORDER BY se.start_date`,
      [scope.id_category],
    )
    return {
      status: 'Success',
      mensaje: 'Comparación entre temporadas generada con éxito',
      dashboard: {
        id_category: scope.id_category,
        seasons: rows.map((row) => ({
          id_season: Number(row.id_season),
          name: String(row.name),
          status: String(row.status),
          start_date: str(row.start_date),
          end_date: str(row.end_date),
          athletes: num(row.athletes),
          sessions: num(row.sessions),
          matches: num(row.matches),
          avg_session_load: roundOrNull(row.avg_load, 1),
          avg_rpe: roundOrNull(row.avg_rpe, 1),
          injuries: num(row.injuries),
          avg_progress_index: roundOrNull(row.avg_progress, 1),
          talent_flags: num(row.talent_flags),
        })),
        warnings: [],
      },
    }
  }

  async getInjuryRisk(query: DashboardQueryDto, user: User) {
    const scope = await this.scopes.resolveScope(query, user)
    const rows = await this.query(
      `SELECT a.id_user, u.name, u.lastname, a.method, a.risk_level,
              to_char(a.assessment_date, 'YYYY-MM-DD') AS date,
              a.triggered_rules, a.acwr_value
       FROM (
         SELECT DISTINCT ON (ra.id_user) ra.*
         FROM injury_risk_assessments ra
         WHERE ra.status = 'open'
           AND ra.risk_level IN ('medio', 'alto')
           AND ra.assessment_date BETWEEN $1 AND $2
           AND ra.id_user = ANY($3::int[])
         ORDER BY ra.id_user, ra.assessment_date DESC,
                  CASE ra.risk_level WHEN 'alto' THEN 0 ELSE 1 END
       ) a
       JOIN users u ON u.id_user = a.id_user`,
      this.scopes.baseParams(scope).slice(0, 3),
    )
    const openDays = await this.query(
      `SELECT ra.id_user, COUNT(*) AS open_days,
              MAX(CASE ra.risk_level WHEN 'alto' THEN 2 ELSE 1 END) AS peak
       FROM injury_risk_assessments ra
       WHERE ra.status = 'open'
         AND ra.risk_level IN ('medio', 'alto')
         AND ra.assessment_date BETWEEN $1 AND $2
         AND ra.id_user = ANY($3::int[])
       GROUP BY ra.id_user`,
      this.scopes.baseParams(scope).slice(0, 3),
    )
    const daysByUser = new Map(
      openDays.map((row) => [Number(row.id_user), row]),
    )
    const rank = (level: string) =>
      RISK_LEVEL_ORDER.indexOf(level as (typeof RISK_LEVEL_ORDER)[number])
    const athletes = rows
      .map((row) => {
        const summary = daysByUser.get(Number(row.id_user))
        return {
          id_user: Number(row.id_user),
          athlete: fullName(row),
          risk_level: num(summary?.peak) === 2 ? 'alto' : 'medio',
          last_level: String(row.risk_level),
          last_date: str(row.date),
          open_days: num(summary?.open_days),
          acwr: roundOrNull(row.acwr_value, 2),
          origin: row.method === 'ml_model' ? 'modelo' : 'reglas',
          factors: (str(row.triggered_rules) ?? '')
            .split(',')
            .filter(Boolean)
            .map(ruleLabel),
        }
      })
      .sort(
        (a, b) =>
          rank(b.risk_level) - rank(a.risk_level) ||
          String(b.last_date).localeCompare(String(a.last_date)),
      )
    const warnings: string[] = []
    if (athletes.some((athlete) => athlete.origin === 'modelo'))
      warnings.push(
        'Algunas alertas las creó el modelo de aprendizaje automático; no se puede verificar si se entrenó con datos sintéticos o de demostración',
      )
    return {
      status: 'Success',
      mensaje: 'Deportistas que requieren atención generado con éxito',
      dashboard: {
        filters: this.scopes.filters(scope),
        counts: {
          alto: athletes.filter((athlete) => athlete.risk_level === 'alto')
            .length,
          medio: athletes.filter((athlete) => athlete.risk_level === 'medio')
            .length,
        },
        athletes,
        warnings,
      },
    }
  }
}
