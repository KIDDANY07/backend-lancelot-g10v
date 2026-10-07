import {
  FilterAlertInboxDto,
  InboxKind,
  InboxLevel,
} from './dto/filter-alert-inbox.dto'

export interface InboxRow {
  kind: InboxKind
  id: number
  id_user: number
  athlete_name: string | null
  date: string
  level: InboxLevel
  acwr: string | null
  acute_load: string | null
  chronic_load: string | null
  rpe_avg: string | null
  triggered_rules: string | null
  details: string | null
  method: string | null
}

export interface InboxItem {
  kind: InboxKind
  id: number
  id_user: number
  athlete_name: string
  date: string
  level: InboxLevel
  acwr_value: number | null
  acute_load: number | null
  chronic_load: number | null
  rpe_avg: number | null
  triggered_rules: string[]
  details: string | null
  method: string | null
}

export const INBOX_SOURCE = `
  SELECT 'fatigue' AS kind, alert.id_alert AS id, alert.id_user, alert.date::text AS date,
         alert.level::text AS level, alert.status::text AS status,
         alert.acwr_value AS acwr, alert.acute_load, alert.chronic_load, alert.rpe_avg,
         NULL::text AS triggered_rules, NULL::text AS details, NULL::text AS method
  FROM fatigue_alerts alert
  UNION ALL
  SELECT 'risk' AS kind, assessment.id_assessment AS id, assessment.id_user,
         assessment.assessment_date::text AS date, assessment.risk_level::text AS level,
         assessment.status::text AS status, assessment.acwr_value AS acwr,
         NULL::numeric AS acute_load, NULL::numeric AS chronic_load, NULL::numeric AS rpe_avg,
         assessment.triggered_rules, assessment.details, assessment.method::text AS method
  FROM injury_risk_assessments assessment
`

const toNumber = (value: string | null) =>
  value === null || value === undefined ? null : Number(value)

export function toInboxItem(row: InboxRow): InboxItem {
  return {
    kind: row.kind,
    id: Number(row.id),
    id_user: Number(row.id_user),
    athlete_name: row.athlete_name?.trim() ?? '',
    date: row.date.slice(0, 10),
    level: row.level,
    acwr_value: toNumber(row.acwr),
    acute_load: toNumber(row.acute_load),
    chronic_load: toNumber(row.chronic_load),
    rpe_avg: toNumber(row.rpe_avg),
    triggered_rules: row.triggered_rules
      ? row.triggered_rules.split(',').filter(Boolean)
      : [],
    details: row.details,
    method: row.method,
  }
}

export function buildInboxWhere(filters: FilterAlertInboxDto) {
  const conditions = ['inbox.status = $1']
  const params: (string | number)[] = [filters.status ?? 'open']
  if (filters.kind) {
    params.push(filters.kind)
    conditions.push(`inbox.kind = $${params.length}`)
  }
  if (filters.level) {
    params.push(filters.level)
    conditions.push(`inbox.level = $${params.length}`)
  }
  return { where: conditions.join(' AND '), params }
}
