import { Injectable } from '@nestjs/common'
import { AcwrConfigService } from 'src/acwr_config/acwr-config.service'
import { MlReadinessService } from 'src/ml_engine/ml-readiness.service'
import { TalentReadinessService } from 'src/ml_engine/talent-readiness.service'
import { ROLE_IDS } from 'src/roles/role-codes'
import { User } from 'src/users/entities/user.entity'
import { DashboardMetricsService } from './dashboard-metrics.service'
import {
  DashboardScope,
  DashboardScopeService,
} from './dashboard-scope.service'
import {
  Row,
  fullName,
  num,
  roundOrNull,
  str,
  toBool,
} from './dashboard-sql.util'
import { DashboardQueryDto } from './dto/dashboard-query.dto'

export const SESSION_TYPE_LABELS: Record<string, string> = {
  tecnico: 'Técnico',
  fisico: 'Físico',
  tactico: 'Táctico',
  mixto: 'Mixto',
}

export const WEEKDAY_LABELS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
]

export const STAGE_LABELS: Record<string, string> = {
  pre: 'Inicial',
  mid: 'Intermedia',
  post: 'Final',
}

const HEALTH_DETAIL_ROLES = new Set(['ADMIN', 'ENCARGADO_SALUD'])
const TALENT_ROLES = new Set(['ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR'])

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

@Injectable()
export class DashboardInsightsService {
  constructor(
    private readonly scopes: DashboardScopeService,
    private readonly metrics: DashboardMetricsService,
    private readonly acwrConfigService: AcwrConfigService,
    private readonly mlReadinessService: MlReadinessService,
    private readonly talentReadinessService: TalentReadinessService,
  ) {}

  private query<T = Row>(sql: string, params: unknown[]): Promise<T[]> {
    return this.scopes.query<T>(sql, params)
  }

  private sessionClause(scope: DashboardScope): string {
    return scope.isAthlete
      ? `AND EXISTS (SELECT 1 FROM athletes_in_categories a
           WHERE a.id_user = ANY($3::int[]) AND a.id_category = s.id_category AND a.id_season = s.id_season)`
      : 'AND $3::int[] IS NOT NULL'
  }

  private async seasonId(scope: DashboardScope): Promise<number | null> {
    const season = await this.scopes.seasonForScope(scope)
    return season ? Number(season.id_season) : null
  }

  async getTraining(query: DashboardQueryDto, user: User) {
    const scope = await this.scopes.resolveScope(query, user)
    const params = this.scopes.baseParams(scope)
    const sessionWhere = `s.date BETWEEN $1 AND $2
      AND ($4::int IS NULL OR s.id_season = $4)
      AND ($5::int IS NULL OR s.id_category = $5)
      ${this.sessionClause(scope)}`
    const loadWhere = `s.date BETWEEN $1 AND $2
      AND ($4::int IS NULL OR s.id_season = $4)
      AND ($5::int IS NULL OR s.id_category = $5)
      AND l.id_user = ANY($3::int[])`
    const [sessionsByType, loadsByType, weekdays, rpe] = await Promise.all([
      this.query(
        `SELECT s.type, COUNT(*) AS sessions, AVG(s.planned_duration_min) AS planned
         FROM training_sessions s WHERE ${sessionWhere} GROUP BY s.type`,
        params,
      ),
      this.query(
        `SELECT s.type, COUNT(*) AS loads, AVG(l.session_load) AS avg_load,
                AVG(l.rpe) AS avg_rpe, AVG(l.duration_min) AS actual
         FROM training_loads l JOIN training_sessions s ON s.id_session = l.id_session
         WHERE ${loadWhere} GROUP BY s.type`,
        params,
      ),
      this.query(
        `SELECT EXTRACT(ISODOW FROM s.date)::int AS dow, COUNT(*) AS sessions
         FROM training_sessions s WHERE ${sessionWhere} GROUP BY 1`,
        params,
      ),
      this.query(
        `SELECT l.rpe, COUNT(*) AS total
         FROM training_loads l JOIN training_sessions s ON s.id_session = l.id_session
         WHERE ${loadWhere} GROUP BY l.rpe`,
        params,
      ),
    ])
    const loadType = new Map(loadsByType.map((row) => [String(row.type), row]))
    const sessionType = new Map(
      sessionsByType.map((row) => [String(row.type), row]),
    )
    const byType = Object.keys(SESSION_TYPE_LABELS).map((type) => {
      const session = sessionType.get(type)
      const load = loadType.get(type)
      return {
        type,
        label: SESSION_TYPE_LABELS[type],
        sessions: num(session?.sessions),
        planned_minutes: roundOrNull(session?.planned, 0),
        actual_minutes: roundOrNull(load?.actual, 0),
        loads: num(load?.loads),
        avg_session_load: roundOrNull(load?.avg_load, 1),
        avg_rpe: roundOrNull(load?.avg_rpe, 1),
      }
    })
    const dowMap = new Map(
      weekdays.map((row) => [num(row.dow), num(row.sessions)]),
    )
    const rpeMap = new Map(rpe.map((row) => [num(row.rpe), num(row.total)]))
    const minRpe = Math.min(1, ...rpeMap.keys())
    const warnings: string[] = []
    if (byType.every((row) => row.sessions === 0))
      warnings.push('Datos insuficientes: no hay sesiones en el periodo')
    return {
      status: 'Success',
      mensaje: 'Indicadores de entrenamiento generados con éxito',
      dashboard: {
        filters: this.scopes.filters(scope),
        by_type: byType,
        by_weekday: WEEKDAY_LABELS.map((label, index) => ({
          day: index + 1,
          label,
          sessions: dowMap.get(index + 1) ?? 0,
        })),
        rpe_distribution: Array.from({ length: 11 - minRpe }, (_, index) => ({
          rpe: minRpe + index,
          total: rpeMap.get(minRpe + index) ?? 0,
        })),
        warnings,
      },
    }
  }

  async getMatches(query: DashboardQueryDto, user: User) {
    const scope = await this.scopes.resolveScope(query, user)
    const params = [
      scope.period.from,
      scope.period.to,
      scope.athleteIds,
      scope.id_category,
    ]
    const matchWhere = `m.date BETWEEN $1 AND $2
      AND ($4::int IS NULL OR m.id_category = $4)
      ${
        scope.isAthlete
          ? 'AND EXISTS (SELECT 1 FROM match_statistics x WHERE x.id_match = m.id_match AND x.id_user = ANY($3::int[]))'
          : 'AND $3::int[] IS NOT NULL'
      }`
    const statsJoin =
      'LEFT JOIN match_statistics st ON st.id_match = m.id_match AND st.id_user = ANY($3::int[])'
    const [monthly, competitions, totals, players] = await Promise.all([
      this.query(
        `SELECT to_char(date_trunc('month', m.date), 'YYYY-MM') AS key,
                COUNT(DISTINCT m.id_match) AS matches,
                COALESCE(SUM(st.goals), 0) AS goals,
                COALESCE(SUM(st.assists), 0) AS assists,
                AVG(st.rpe) AS avg_rpe
         FROM matches m ${statsJoin}
         WHERE ${matchWhere} GROUP BY 1 ORDER BY 1`,
        params,
      ),
      this.query(
        `SELECT c.id_competency, c.name,
                COUNT(DISTINCT m.id_match) AS matches,
                COALESCE(SUM(st.goals), 0) AS goals
         FROM matches m
         JOIN competencies c ON c.id_competency = m.id_competency
         ${statsJoin}
         WHERE ${matchWhere}
         GROUP BY c.id_competency, c.name
         ORDER BY matches DESC, c.name`,
        params,
      ),
      this.query(
        `SELECT COUNT(DISTINCT m.id_match) AS matches,
                COUNT(st.id_match_stat) AS appearances,
                COUNT(DISTINCT st.id_user) AS players,
                COALESCE(SUM(st.minutes_played), 0) AS minutes,
                COALESCE(SUM(st.goals), 0) AS goals,
                COALESCE(SUM(st.assists), 0) AS assists,
                COALESCE(SUM(st.yellow_cards), 0) AS yellow_cards,
                COALESCE(SUM(st.red_cards), 0) AS red_cards,
                COALESCE(SUM(st.saves), 0) AS saves,
                COALESCE(SUM(st.goals_conceded), 0) AS goals_conceded,
                AVG(st.minutes_played) AS avg_minutes,
                AVG(st.rpe) AS avg_rpe,
                COUNT(st.id_match_stat) FILTER (WHERE st.rpe IS NULL) AS without_rpe
         FROM matches m ${statsJoin}
         WHERE ${matchWhere}`,
        params,
      ),
      this.query(
        `SELECT st.id_user, u.name, u.lastname,
                COUNT(*) AS appearances,
                SUM(st.minutes_played) AS minutes,
                SUM(st.goals) AS goals,
                SUM(st.assists) AS assists
         FROM match_statistics st
         JOIN matches m ON m.id_match = st.id_match
         JOIN users u ON u.id_user = st.id_user
         WHERE m.date BETWEEN $1 AND $2
           AND ($4::int IS NULL OR m.id_category = $4)
           AND st.id_user = ANY($3::int[])
         GROUP BY st.id_user, u.name, u.lastname`,
        params,
      ),
    ])
    const total = totals[0] ?? {}
    const monthlyRows = this.metrics.fillByKey(
      this.metrics.monthKeys(scope.period),
      monthly.map((row) => ({
        key: String(row.key),
        matches: num(row.matches),
        goals: num(row.goals),
        assists: num(row.assists),
        avg_rpe: roundOrNull(row.avg_rpe, 1),
      })),
      (key) => ({ key, matches: 0, goals: 0, assists: 0, avg_rpe: null }),
    )
    const playerRows = players.map((row) => ({
      id_user: Number(row.id_user),
      athlete: fullName(row),
      appearances: num(row.appearances),
      minutes: num(row.minutes),
      goals: num(row.goals),
      assists: num(row.assists),
    }))
    const warnings: string[] = []
    if (num(total.matches) === 0)
      warnings.push('Datos insuficientes: no hay partidos en el periodo')
    if (num(total.without_rpe) > 0)
      warnings.push(
        `${num(total.without_rpe)} participaciones en partidos no tienen RPE registrado`,
      )
    return {
      status: 'Success',
      mensaje: 'Indicadores de partidos generados con éxito',
      dashboard: {
        filters: this.scopes.filters(scope),
        totals: {
          matches: num(total.matches),
          appearances: num(total.appearances),
          players: num(total.players),
          minutes: num(total.minutes),
          goals: num(total.goals),
          assists: num(total.assists),
          yellow_cards: num(total.yellow_cards),
          red_cards: num(total.red_cards),
          saves: num(total.saves),
          goals_conceded: num(total.goals_conceded),
          avg_minutes: roundOrNull(total.avg_minutes, 0),
          avg_rpe: roundOrNull(total.avg_rpe, 1),
        },
        monthly: monthlyRows,
        by_competition: competitions.map((row) => ({
          id_competency: Number(row.id_competency),
          name: String(row.name),
          matches: num(row.matches),
          goals: num(row.goals),
        })),
        top_contributions: [...playerRows]
          .filter((row) => row.goals + row.assists > 0)
          .sort(
            (a, b) =>
              b.goals + b.assists - (a.goals + a.assists) || b.goals - a.goals,
          )
          .slice(0, 10),
        top_minutes: [...playerRows]
          .sort((a, b) => b.minutes - a.minutes)
          .slice(0, 10),
        warnings,
      },
    }
  }

  async getHealth(query: DashboardQueryDto, user: User) {
    const scope = await this.scopes.resolveScope(query, user)
    const params = this.scopes.baseParams(scope).slice(0, 3)
    const role = roleOf(user)
    const detail = HEALTH_DETAIL_ROLES.has(role)
    const { config } = await this.acwrConfigService.getActive(scope.id_category)
    const lowMin = Number(config.low_min)
    const [injMonthly, bodyParts, severity, status, fatigue, risk] =
      await Promise.all([
        this.query(
          `SELECT to_char(date_trunc('month', i.injury_date), 'YYYY-MM') AS key,
                  COUNT(*) FILTER (WHERE i.mechanism = 'contacto') AS contact,
                  COUNT(*) FILTER (WHERE i.mechanism = 'sin_contacto') AS non_contact,
                  COUNT(*) FILTER (WHERE i.mechanism IS NULL) AS unknown
           FROM injuries i
           WHERE i.injury_date BETWEEN $1 AND $2 AND i.id_user = ANY($3::int[])
           GROUP BY 1`,
          params,
        ),
        this.query(
          `SELECT i.body_part, COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE i.severity = 'leve') AS leve,
                  COUNT(*) FILTER (WHERE i.severity = 'moderada') AS moderada,
                  COUNT(*) FILTER (WHERE i.severity = 'severa') AS severa
           FROM injuries i
           WHERE i.injury_date BETWEEN $1 AND $2 AND i.id_user = ANY($3::int[])
           GROUP BY i.body_part ORDER BY total DESC, i.body_part`,
          params,
        ),
        this.query(
          `SELECT i.severity, COUNT(*) AS total,
                  AVG(i.time_loss_days) AS avg_days,
                  COALESCE(SUM(i.time_loss_days), 0) AS total_days
           FROM injuries i
           WHERE i.injury_date BETWEEN $1 AND $2 AND i.id_user = ANY($3::int[])
           GROUP BY i.severity`,
          params,
        ),
        this.query(
          `SELECT i.status, COUNT(*) AS total FROM injuries i
           WHERE i.id_user = ANY($1::int[]) GROUP BY i.status`,
          [scope.athleteIds],
        ),
        this.query(
          `SELECT to_char(date_trunc('week', fa.date), 'YYYY-MM-DD') AS key,
                  COUNT(*) FILTER (WHERE fa.acwr_value >= $4) AS overload,
                  COUNT(*) FILTER (WHERE fa.acwr_value < $4) AS underload,
                  COUNT(*) FILTER (WHERE fa.status = 'open') AS open
           FROM fatigue_alerts fa
           WHERE fa.date BETWEEN $1 AND $2 AND fa.id_user = ANY($3::int[])
           GROUP BY 1`,
          [...params, lowMin],
        ),
        this.query(
          `SELECT to_char(date_trunc('week', ra.assessment_date), 'YYYY-MM-DD') AS key,
                  COUNT(*) FILTER (WHERE ra.risk_level = 'medio') AS medio,
                  COUNT(*) FILTER (WHERE ra.risk_level = 'alto') AS alto
           FROM injury_risk_assessments ra
           WHERE ra.assessment_date BETWEEN $1 AND $2 AND ra.id_user = ANY($3::int[])
           GROUP BY 1`,
          params,
        ),
      ])

    let records: Row[] = []
    let consents: Row[] = []
    let minors: Row[] = []
    if (detail)
      [records, consents, minors] = await Promise.all([
        this.query(
          `SELECT h.condition_type, h.status, COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE h.restriction) AS restricted
           FROM health_records h WHERE h.id_user = ANY($1::int[])
           GROUP BY 1, 2 ORDER BY 3 DESC`,
          [scope.athleteIds],
        ),
        this.query(
          `SELECT pc.status, COUNT(*) AS total FROM parental_consents pc
           WHERE pc.id_user = ANY($1::int[]) GROUP BY 1`,
          [scope.athleteIds],
        ),
        this.query(
          `SELECT COUNT(*) AS minors,
                  COUNT(*) FILTER (WHERE NOT EXISTS (
                    SELECT 1 FROM parental_consents pc
                    WHERE pc.id_user = u.id_user AND pc.status = 'granted')) AS without_consent
           FROM users u
           WHERE u.id_user = ANY($1::int[])
             AND u.birth_date IS NOT NULL
             AND u.birth_date > (CURRENT_DATE - INTERVAL '18 years')`,
          [scope.athleteIds],
        ),
      ])

    const weekKeys = this.metrics.periodKeys(scope.period, 'week')
    const severityMap = new Map(
      severity.map((row) => [String(row.severity), row]),
    )
    const statusMap = new Map(
      status.map((row) => [String(row.status), num(row.total)]),
    )
    const warnings: string[] = []
    if (severity.length === 0)
      warnings.push('No hay lesiones registradas en el periodo')
    const unknown = injMonthly.reduce((sum, row) => sum + num(row.unknown), 0)
    if (unknown > 0)
      warnings.push(
        `${unknown} lesiones del periodo no tienen mecanismo registrado`,
      )
    return {
      status: 'Success',
      mensaje: 'Indicadores de salud generados con éxito',
      dashboard: {
        filters: this.scopes.filters(scope),
        injuries_monthly: this.metrics.fillByKey(
          this.metrics.monthKeys(scope.period),
          injMonthly.map((row) => ({
            key: String(row.key),
            contact: num(row.contact),
            non_contact: num(row.non_contact),
            unknown: num(row.unknown),
          })),
          (key) => ({ key, contact: 0, non_contact: 0, unknown: 0 }),
        ),
        injuries_by_body_part: bodyParts.map((row) => ({
          body_part: String(row.body_part),
          total: num(row.total),
          leve: num(row.leve),
          moderada: num(row.moderada),
          severa: num(row.severa),
        })),
        injuries_by_severity: ['leve', 'moderada', 'severa'].map((level) => {
          const row = severityMap.get(level)
          return {
            severity: level,
            total: num(row?.total),
            avg_days_lost: roundOrNull(row?.avg_days, 1),
            total_days_lost: num(row?.total_days),
          }
        }),
        injury_status: {
          active: statusMap.get('active') ?? 0,
          recovering: statusMap.get('recovering') ?? 0,
          recovered: statusMap.get('recovered') ?? 0,
        },
        fatigue_weekly: this.metrics.fillByKey(
          weekKeys,
          fatigue.map((row) => ({
            key: String(row.key),
            overload: num(row.overload),
            underload: num(row.underload),
            open: num(row.open),
          })),
          (key) => ({ key, overload: 0, underload: 0, open: 0 }),
        ),
        risk_weekly: this.metrics.fillByKey(
          weekKeys,
          risk.map((row) => ({
            key: String(row.key),
            medio: num(row.medio),
            alto: num(row.alto),
          })),
          (key) => ({ key, medio: 0, alto: 0 }),
        ),
        health_records: detail
          ? records.map((row) => ({
              condition_type: String(row.condition_type),
              status: String(row.status),
              total: num(row.total),
              restricted: num(row.restricted),
            }))
          : null,
        consents: detail
          ? {
              by_status: consents.map((row) => ({
                status: String(row.status),
                total: num(row.total),
              })),
              minors: num(minors[0]?.minors),
              minors_without_consent: num(minors[0]?.without_consent),
            }
          : null,
        underload_threshold: lowMin,
        warnings,
      },
    }
  }

  async getDevelopment(query: DashboardQueryDto, user: User) {
    const scope = await this.scopes.resolveScope(query, user)
    const idSeason = await this.seasonId(scope)
    const role = roleOf(user)
    const evalParams = [
      scope.period.from,
      scope.period.to,
      scope.athleteIds,
      idSeason,
    ]
    const evalWhere = (alias: string) =>
      `${alias}.id_user = ANY($3::int[])
       AND (($4::int IS NOT NULL AND ${alias}.id_season = $4)
         OR ($4::int IS NULL AND ${alias}.eval_date BETWEEN $1 AND $2))`
    const [indicators, techMonthly, physical, indexBuckets, components] =
      await Promise.all([
        this.query(
          `SELECT t.dimension, t.indicator, AVG(t.score) AS avg_score,
                  COUNT(*) AS evaluations, COUNT(DISTINCT t.id_user) AS athletes
           FROM technical_evaluations t WHERE ${evalWhere('t')}
           GROUP BY 1, 2 ORDER BY 1, 2`,
          evalParams,
        ),
        this.query(
          `SELECT to_char(date_trunc('month', t.eval_date), 'YYYY-MM') AS key,
                  AVG(t.score) FILTER (WHERE t.dimension = 'tecnica') AS tecnica,
                  AVG(t.score) FILTER (WHERE t.dimension = 'tactica') AS tactica
           FROM technical_evaluations t WHERE ${evalWhere('t')}
           GROUP BY 1 ORDER BY 1`,
          evalParams,
        ),
        this.query(
          `SELECT p.stage, COUNT(*) AS evaluations,
                  AVG(p.vo2max_estimado) AS vo2max, AVG(p.speed_20m) AS speed_20m,
                  AVG(p.weight_kg) AS weight_kg, AVG(p.height_cm) AS height_cm
           FROM physical_evaluations p WHERE ${evalWhere('p')}
           GROUP BY 1`,
          evalParams,
        ),
        idSeason
          ? this.query(
              `SELECT LEAST(width_bucket(w.index_value, 0, 100, 20), 20) AS bucket,
                      COUNT(*) AS total
               FROM weighted_progress_indices w
               WHERE w.id_season = $1 AND w.id_user = ANY($2::int[])
               GROUP BY 1`,
              [idSeason, scope.athleteIds],
            )
          : Promise.resolve([] as Row[]),
        idSeason
          ? this.query(
              `SELECT AVG(w.physical_score) AS physical, AVG(w.technical_score) AS technical,
                      AVG(w.tactical_score) AS tactical, AVG(w.participation_score) AS participation,
                      AVG(w.contribution_score) AS contribution, AVG(w.index_value) AS index_value,
                      COUNT(*) AS athletes,
                      (SELECT AVG(p.index_value) FROM weighted_progress_indices p
                       WHERE p.id_user = ANY($2::int[])
                         AND p.id_season = (
                           SELECT s2.id_season FROM seasons s2
                           WHERE s2.start_date < (SELECT s1.start_date FROM seasons s1 WHERE s1.id_season = $1)
                           ORDER BY s2.start_date DESC LIMIT 1)) AS previous_index
               FROM weighted_progress_indices w
               WHERE w.id_season = $1 AND w.id_user = ANY($2::int[])`,
              [idSeason, scope.athleteIds],
            )
          : Promise.resolve([] as Row[]),
      ])

    const showTalent = TALENT_ROLES.has(role)
    let flags: Row[] = []
    let objectives: Row[] = []
    if (idSeason)
      [flags, objectives] = await Promise.all([
        showTalent
          ? this.query(
              `SELECT t.source, t.status, COUNT(*) AS total FROM talent_flags t
               WHERE t.id_season = $1 AND t.id_user = ANY($2::int[]) GROUP BY 1, 2`,
              [idSeason, scope.athleteIds],
            )
          : Promise.resolve([] as Row[]),
        this.query(
          `SELECT o.status, COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE o.status = 'open' AND o.target_date < CURRENT_DATE) AS overdue
           FROM development_objectives o
           WHERE o.id_season = $1 AND o.id_user = ANY($2::int[]) GROUP BY 1`,
          [idSeason, scope.athleteIds],
        ),
      ])

    const stageMap = new Map(physical.map((row) => [String(row.stage), row]))
    const comp = components[0] ?? {}
    const objectiveMap = new Map(
      objectives.map((row) => [String(row.status), row]),
    )
    const warnings: string[] = []
    if (!idSeason)
      warnings.push(
        'Elige una temporada para ver el índice de progreso, las señalizaciones y los objetivos',
      )
    if (indicators.length === 0)
      warnings.push(
        'Datos insuficientes: no hay evaluaciones técnicas en el periodo',
      )
    return {
      status: 'Success',
      mensaje: 'Indicadores de desarrollo generados con éxito',
      dashboard: {
        filters: this.scopes.filters(scope),
        id_season: idSeason,
        technical_by_indicator: indicators.map((row) => ({
          dimension: String(row.dimension),
          indicator: String(row.indicator),
          avg_score: roundOrNull(row.avg_score, 2),
          evaluations: num(row.evaluations),
          athletes: num(row.athletes),
        })),
        technical_monthly: techMonthly.map((row) => ({
          key: String(row.key),
          tecnica: roundOrNull(row.tecnica, 2),
          tactica: roundOrNull(row.tactica, 2),
        })),
        physical_by_stage: ['pre', 'mid', 'post']
          .filter((stage) => stageMap.has(stage))
          .map((stage) => {
            const row = stageMap.get(stage) ?? {}
            return {
              stage,
              label: STAGE_LABELS[stage],
              evaluations: num(row.evaluations),
              vo2max: roundOrNull(row.vo2max, 1),
              speed_20m: roundOrNull(row.speed_20m, 2),
              weight_kg: roundOrNull(row.weight_kg, 1),
              height_cm: roundOrNull(row.height_cm, 1),
            }
          }),
        progress: idSeason
          ? {
              athletes: num(comp.athletes),
              index_value: roundOrNull(comp.index_value, 1),
              previous_index: roundOrNull(comp.previous_index, 1),
              components: [
                {
                  key: 'physical',
                  label: 'Físico',
                  value: roundOrNull(comp.physical, 1),
                },
                {
                  key: 'technical',
                  label: 'Técnico',
                  value: roundOrNull(comp.technical, 1),
                },
                {
                  key: 'tactical',
                  label: 'Táctico',
                  value: roundOrNull(comp.tactical, 1),
                },
                {
                  key: 'participation',
                  label: 'Participación',
                  value: roundOrNull(comp.participation, 1),
                },
                {
                  key: 'contribution',
                  label: 'Contribución en partidos',
                  value: roundOrNull(comp.contribution, 1),
                },
              ],
              distribution: this.metrics.histogram(
                indexBuckets.map((row) => ({
                  bucket: num(row.bucket),
                  total: num(row.total),
                })),
                20,
                0,
                5,
                0,
              ),
            }
          : null,
        talent_flags:
          showTalent && idSeason
            ? ['manual', 'rules', 'ml'].map((source) => {
                const ofSource = flags.filter(
                  (row) => String(row.source) === source,
                )
                const count = (statusName: string) =>
                  num(
                    ofSource.find((row) => String(row.status) === statusName)
                      ?.total,
                  )
                return {
                  source,
                  open: count('open'),
                  reviewed: count('reviewed'),
                  dismissed: count('dismissed'),
                }
              })
            : null,
        objectives: idSeason
          ? {
              open: num(objectiveMap.get('open')?.total),
              achieved: num(objectiveMap.get('achieved')?.total),
              missed: num(objectiveMap.get('missed')?.total),
              overdue: num(objectiveMap.get('open')?.overdue),
            }
          : null,
        warnings,
      },
    }
  }

  async getMl(query: DashboardQueryDto, user: User) {
    const scope = await this.scopes.resolveScope(query, user)
    const idSeason = await this.seasonId(scope)
    const params = this.scopes.baseParams(scope).slice(0, 3)
    const [engineRows, models, daily, probMax, labels, talent] =
      await Promise.all([
        this.query(
          `SELECT engine, talent_engine, prob_medium_threshold, prob_high_threshold,
                  talent_prob_threshold
           FROM ml_engine_configs ORDER BY id_config LIMIT 1`,
          [],
        ),
        this.query(
          `SELECT id_model, version, task, algorithm, is_active,
                  to_char(created_at, 'YYYY-MM-DD') AS created,
                  metrics, rules_baseline_metrics
           FROM ml_models ORDER BY created_at`,
          [],
        ),
        this.query(
          `SELECT to_char(p.date, 'YYYY-MM-DD') AS key,
                  COUNT(*) FILTER (WHERE p.risk_level = 'bajo') AS bajo,
                  COUNT(*) FILTER (WHERE p.risk_level = 'medio') AS medio,
                  COUNT(*) FILTER (WHERE p.risk_level = 'alto') AS alto,
                  AVG(p.probability) AS avg_probability
           FROM injury_risk_predictions p
           WHERE p.date BETWEEN $1 AND $2 AND p.id_user = ANY($3::int[])
           GROUP BY 1 ORDER BY 1`,
          params,
        ),
        this.query(
          `SELECT MIN(p.probability) AS min, MAX(p.probability) AS max FROM injury_risk_predictions p
           WHERE p.date BETWEEN $1 AND $2 AND p.id_user = ANY($3::int[])`,
          params,
        ),
        this.query(
          `SELECT f.label_quality, COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE f.label_injury_7d) AS positives
           FROM athlete_daily_features f
           WHERE f.date BETWEEN $1 AND $2 AND f.id_user = ANY($3::int[])
           GROUP BY 1`,
          params,
        ),
        this.query(
          `SELECT tp.id_season, s.name
           FROM talent_predictions tp
           JOIN seasons s ON s.id_season = tp.id_season
           WHERE tp.id_user = ANY($2::int[])
           GROUP BY tp.id_season, s.name, s.start_date
           ORDER BY (tp.id_season = $1::int) DESC NULLS LAST, s.start_date DESC
           LIMIT 1`,
          [idSeason, scope.athleteIds],
        ),
      ])

    const min = Number(probMax[0]?.min ?? 0)
    const max = Number(probMax[0]?.max ?? 0)
    const hasPredictions =
      probMax[0]?.max !== null && probMax[0]?.max !== undefined
    const bins = max > min ? 10 : 1
    const width = max > min ? (max - min) / bins : 0
    const probBuckets = hasPredictions
      ? max > min
        ? await this.query(
            `SELECT LEAST(width_bucket(p.probability, $4, $5, 10), 10) AS bucket, COUNT(*) AS total
             FROM injury_risk_predictions p
             WHERE p.date BETWEEN $1 AND $2 AND p.id_user = ANY($3::int[])
             GROUP BY 1`,
            [...params, min, max],
          )
        : [
            {
              bucket: 1,
              total: daily.reduce(
                (sum, row) =>
                  sum + num(row.bajo) + num(row.medio) + num(row.alto),
                0,
              ),
            },
          ]
      : []
    const talentSeason = talent[0] ?? null
    const talentRows = talentSeason
      ? await this.query(
          `SELECT LEAST(width_bucket(tp.probability, 0, 1, 10), 10) AS bucket,
                  COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE tp.rules_flagged) AS rules_flagged,
                  COUNT(*) FILTER (WHERE tp.probability >= $3) AS above_threshold
           FROM talent_predictions tp
           WHERE tp.id_season = $1 AND tp.id_user = ANY($2::int[])
           GROUP BY 1`,
          [
            Number(talentSeason.id_season),
            scope.athleteIds,
            Number(engineRows[0]?.talent_prob_threshold ?? 0.5),
          ],
        )
      : []
    const [readiness, talentReadiness] = await Promise.all([
      this.mlReadinessService.evaluate(),
      this.talentReadinessService.evaluate(),
    ])
    const engine = engineRows[0] ?? null
    const modelRows = models.map((row) => {
      const metrics = parseJson(row.metrics)
      const baseline = parseJson(row.rules_baseline_metrics)
      return {
        id_model: Number(row.id_model),
        version: String(row.version),
        task: String(row.task),
        algorithm: String(row.algorithm),
        is_active: toBool(row.is_active),
        created: str(row.created),
        pr_auc: roundOrNull(metrics.pr_auc, 3),
        roc_auc: roundOrNull(metrics.roc_auc, 3),
        recall: roundOrNull(metrics.recall, 3),
        precision: roundOrNull(metrics.precision, 3),
        rules_pr_auc: roundOrNull(baseline.pr_auc, 3),
      }
    })
    const warnings: string[] = [
      'El registro de modelos no guarda si un modelo se entrenó con datos sintéticos o de demostración: no se puede verificar el origen de sus datos',
    ]
    const engineMode = engine ? String(engine.engine) : 'rules'
    if (engineMode === 'shadow')
      warnings.push(
        'Modo sombra: el modelo calcula una probabilidad estimada en segundo plano y no genera alertas; las alertas salen de las reglas',
      )
    for (const model of modelRows.filter((item) => item.is_active))
      if (
        model.pr_auc !== null &&
        model.rules_pr_auc !== null &&
        model.pr_auc <= model.rules_pr_auc
      )
        warnings.push(
          `El modelo activo ${model.version} no supera a las reglas en la prueba (PR-AUC ${model.pr_auc} frente a ${model.rules_pr_auc})`,
        )
    if (daily.length === 0)
      warnings.push(
        'Datos insuficientes: el modelo no hizo predicciones en el periodo',
      )
    return {
      status: 'Success',
      mensaje: 'Indicadores del modelo de ML generados con éxito',
      dashboard: {
        filters: this.scopes.filters(scope),
        engine: engine
          ? {
              engine: String(engine.engine),
              talent_engine: String(engine.talent_engine),
              prob_medium_threshold: roundOrNull(
                engine.prob_medium_threshold,
                3,
              ),
              prob_high_threshold: roundOrNull(engine.prob_high_threshold, 3),
              talent_prob_threshold: roundOrNull(
                engine.talent_prob_threshold,
                3,
              ),
            }
          : null,
        models: modelRows,
        predictions_daily: daily.map((row) => ({
          key: String(row.key),
          bajo: num(row.bajo),
          medio: num(row.medio),
          alto: num(row.alto),
          avg_probability: roundOrNull(row.avg_probability, 4),
        })),
        probability_distribution: hasPredictions
          ? this.metrics.histogram(
              probBuckets.map((row) => ({
                bucket: num(row.bucket),
                total: num(row.total),
              })),
              bins,
              min,
              width || Math.max(min * 0.01, 0.0001),
              6,
            )
          : [],
        labels: labels.map((row) => ({
          label_quality: String(row.label_quality),
          total: num(row.total),
          positives: num(row.positives),
        })),
        readiness: {
          injury: readiness,
          talent: talentReadiness,
        },
        talent_predictions: talentSeason
          ? {
              id_season: Number(talentSeason.id_season),
              season_name: String(talentSeason.name),
              is_selected_season: Number(talentSeason.id_season) === idSeason,
              total: talentRows.reduce((sum, row) => sum + num(row.total), 0),
              rules_flagged: talentRows.reduce(
                (sum, row) => sum + num(row.rules_flagged),
                0,
              ),
              above_threshold: talentRows.reduce(
                (sum, row) => sum + num(row.above_threshold),
                0,
              ),
              distribution: this.metrics.histogram(
                talentRows.map((row) => ({
                  bucket: num(row.bucket),
                  total: num(row.total),
                })),
                10,
                0,
                0.1,
                1,
              ),
            }
          : null,
        warnings,
      },
    }
  }
}
