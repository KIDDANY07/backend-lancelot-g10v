import { ObjectLiteral, SelectQueryBuilder } from 'typeorm'

const ACCENTED = 'áéíóúüñÁÉÍÓÚÜÑ'
const PLAIN = 'aeiouunAEIOUUN'

export function normalizeSearch(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

export function applyWordSearch<T extends ObjectLiteral>(
  query: SelectQueryBuilder<T>,
  columns: string[],
  search: string | undefined,
  prefix = 'search',
): SelectQueryBuilder<T> {
  const words = normalizeSearch(search ?? '')
  if (words.length === 0) return query
  const text = `LOWER(TRANSLATE(CONCAT_WS(' ', ${columns.join(', ')}), '${ACCENTED}', '${PLAIN}'))`
  words.forEach((word, index) => {
    query.andWhere(`${text} LIKE :${prefix}${index}`, {
      [`${prefix}${index}`]: `%${word.replace(/[\\%_]/g, (char) => `\\${char}`)}%`,
    })
  })
  return query
}
