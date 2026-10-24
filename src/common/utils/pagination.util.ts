export const DEFAULT_PAGE_LIMIT = 10

export function paginateList<T>(
  items: T[],
  { page, limit = DEFAULT_PAGE_LIMIT }: { page?: number; limit?: number } = {},
) {
  const total = items.length
  if (!page)
    return {
      items,
      pagination: { total, page: 1, limit: total, totalPages: total ? 1 : 0 },
    }
  const offset = (page - 1) * limit
  return {
    items: items.slice(offset, offset + limit),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  }
}
