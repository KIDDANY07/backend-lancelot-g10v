import { Injectable } from '@nestjs/common'
import { createHmac } from 'crypto'

export const PSEUDONYM_LENGTH = 16

export const EXPORT_COLUMNS = [
  'athlete_key',
  'date',
  'id_season',
  'id_category',
  'position',
  'age_years',
  'acute_load_7d',
  'chronic_load_28d',
  'acwr',
  'acwr_ewma',
  'monotony_7d',
  'strain_7d',
  'sessions_7d',
  'rpe_avg_7d',
  'match_minutes_7d',
  'high_rpe_sessions_14d',
  'prior_injuries_count',
  'prior_non_contact_injuries_count',
  'days_since_last_injury',
  'is_recovering',
  'is_available',
  'rules_risk_level',
  'label_injury_7d',
  'label_quality',
  'feature_version',
] as const

@Injectable()
export class FeatureExportService {
  pseudonymize(id_user: number, salt: string): string {
    return createHmac('sha256', salt)
      .update(String(id_user))
      .digest('hex')
      .slice(0, PSEUDONYM_LENGTH)
  }

  private escapeCsv(value: unknown): string {
    if (value === null || value === undefined) return ''
    let text: string
    if (value instanceof Date) text = value.toISOString()
    else if (typeof value === 'string') text = value
    else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    )
      text = value.toString()
    else text = JSON.stringify(value) ?? ''
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  toCsv(
    rows: (Record<string, unknown> & { id_user: number })[],
    salt: string,
  ): string {
    const lines = [EXPORT_COLUMNS.join(',')]
    for (const row of rows) {
      const exportRow: Record<string, unknown> = {
        ...row,
        athlete_key: this.pseudonymize(row.id_user, salt),
      }
      lines.push(
        EXPORT_COLUMNS.map((column) => this.escapeCsv(exportRow[column])).join(
          ',',
        ),
      )
    }
    return `${lines.join('\n')}\n`
  }
}
