import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import {
  FilterAlertInboxDto,
  INBOX_KINDS,
  INBOX_LEVELS,
  InboxKind,
  InboxLevel,
} from './dto/filter-alert-inbox.dto'
import {
  buildInboxWhere,
  INBOX_SOURCE,
  InboxRow,
  toInboxItem,
} from './alert-inbox.query'

@Injectable()
export class AlertInboxService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findAll(filters: FilterAlertInboxDto) {
    const page = filters.page ?? 1
    const limit = filters.limit ?? 10
    const { where, params } = buildInboxWhere(filters)

    const [rows, totalRows, countRows] = await Promise.all([
      this.dataSource.query<InboxRow[]>(
        `SELECT inbox.*, CONCAT(athlete.name, ' ', athlete.lastname) AS athlete_name
         FROM (${INBOX_SOURCE}) inbox
         JOIN users athlete ON athlete.id_user = inbox.id_user
         WHERE ${where}
         ORDER BY CASE inbox.level WHEN 'alto' THEN 0 WHEN 'medio' THEN 1 ELSE 2 END,
                  inbox.date DESC, athlete_name, inbox.kind, inbox.id
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, (page - 1) * limit],
      ),
      this.dataSource.query<{ total: number }[]>(
        `SELECT COUNT(*)::int AS total FROM (${INBOX_SOURCE}) inbox WHERE ${where}`,
        params,
      ),
      this.dataSource.query<
        { kind: InboxKind; level: InboxLevel; total: number }[]
      >(
        `SELECT inbox.kind, inbox.level, COUNT(*)::int AS total
         FROM (${INBOX_SOURCE}) inbox WHERE inbox.status = $1
         GROUP BY inbox.kind, inbox.level`,
        [filters.status ?? 'open'],
      ),
    ])

    const total = totalRows[0]?.total ?? 0
    const byKind = Object.fromEntries(
      INBOX_KINDS.map((kind) => [kind, 0]),
    ) as Record<InboxKind, number>
    const byLevel = Object.fromEntries(
      INBOX_LEVELS.map((level) => [level, 0]),
    ) as Record<InboxLevel, number>
    for (const row of countRows) {
      byKind[row.kind] += row.total
      byLevel[row.level] += row.total
    }

    return {
      status: 'Success',
      mensaje: 'Consulta de la bandeja de alertas exitosa',
      items: rows.map(toInboxItem),
      counts: {
        total: byKind.fatigue + byKind.risk,
        by_kind: byKind,
        by_level: byLevel,
      },
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }
}
