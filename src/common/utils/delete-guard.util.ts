import { ConflictException } from '@nestjs/common'
import { EntityManager } from 'typeorm'

export interface ReferenceCheck {
  table: string
  column: string
  singular: string
  plural: string
}

export interface ReferenceCount {
  singular: string
  plural: string
  total: number
}

export async function countReferences(
  manager: EntityManager,
  checks: ReferenceCheck[],
  id: number,
): Promise<ReferenceCount[]> {
  const counts = await Promise.all(
    checks.map(async ({ table, column, singular, plural }) => {
      const rows: { total: number }[] = await manager.query(
        `SELECT COUNT(*)::int AS total FROM "${table}" WHERE "${column}" = $1`,
        [id],
      )
      return { singular, plural, total: rows[0]?.total ?? 0 }
    }),
  )
  return counts.filter((count) => count.total > 0)
}

export function describeReferences(references: ReferenceCount[]): string {
  const parts = references.map(
    ({ singular, plural, total }) =>
      `${total} ${total === 1 ? singular : plural}`,
  )
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}

export function assertNoReferences(
  subject: string,
  references: ReferenceCount[],
  hint: string,
) {
  if (references.length === 0) return
  throw new ConflictException({
    status: 'Error',
    mensaje: `No se puede eliminar ${subject} porque tiene ${describeReferences(references)}. ${hint}`,
  })
}
