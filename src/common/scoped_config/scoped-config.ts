export type ConfigScope = 'category' | 'global'

export interface ScopedConfig<T> {
  config: T
  scope: ConfigScope
}

export async function resolveScopedConfig<T>(
  categoryConfig: T | null | undefined,
  loadGlobal: () => Promise<T>,
): Promise<ScopedConfig<T>> {
  if (categoryConfig) return { config: categoryConfig, scope: 'category' }
  return { config: await loadGlobal(), scope: 'global' }
}

export class ScopedConfigCache<T> {
  private readonly cache = new Map<string, Promise<ScopedConfig<T>>>()

  constructor(
    private readonly loader: (
      id_category: number | null,
    ) => Promise<ScopedConfig<T>>,
  ) {}

  get(id_category?: number | null): Promise<ScopedConfig<T>> {
    const key = id_category ? String(id_category) : 'global'
    let pending = this.cache.get(key)
    if (!pending) {
      pending = this.loader(id_category ?? null)
      this.cache.set(key, pending)
      pending.catch(() => this.cache.delete(key))
    }
    return pending
  }
}
