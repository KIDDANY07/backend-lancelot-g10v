import {
  ScopedConfig,
  ScopedConfigCache,
  resolveScopedConfig,
} from './scoped-config'

interface FakeConfig {
  id: number
  id_category: number | null
  low_min: number
}

const GLOBAL: FakeConfig = { id: 1, id_category: null, low_min: 0.8 }
const SUB15: FakeConfig = { id: 2, id_category: 15, low_min: 0.7 }

describe('resolveScopedConfig', () => {
  it('uses the category override when it exists and does not load the global', async () => {
    const loadGlobal = jest.fn().mockResolvedValue(GLOBAL)
    await expect(resolveScopedConfig(SUB15, loadGlobal)).resolves.toEqual({
      config: SUB15,
      scope: 'category',
    })
    expect(loadGlobal).not.toHaveBeenCalled()
  })

  it('falls back to the global config when the category has no override', async () => {
    const loadGlobal = jest.fn().mockResolvedValue(GLOBAL)
    await expect(resolveScopedConfig(null, loadGlobal)).resolves.toEqual({
      config: GLOBAL,
      scope: 'global',
    })
    await expect(resolveScopedConfig(undefined, loadGlobal)).resolves.toEqual({
      config: GLOBAL,
      scope: 'global',
    })
    expect(loadGlobal).toHaveBeenCalledTimes(2)
  })
})

describe('ScopedConfigCache', () => {
  function buildLoader(overrides: Map<number, FakeConfig>) {
    return jest.fn(
      (id_category: number | null): Promise<ScopedConfig<FakeConfig>> =>
        resolveScopedConfig(
          id_category ? overrides.get(id_category) : null,
          () => Promise.resolve(GLOBAL),
        ),
    )
  }

  it('loads each category only once per run', async () => {
    const loader = buildLoader(new Map([[15, SUB15]]))
    const cache = new ScopedConfigCache(loader)

    await cache.get(15)
    await cache.get(15)
    await cache.get(17)
    await cache.get(17)

    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('returns the override for categories that have one and the global for the rest', async () => {
    const cache = new ScopedConfigCache(buildLoader(new Map([[15, SUB15]])))

    await expect(cache.get(15)).resolves.toEqual({
      config: SUB15,
      scope: 'category',
    })
    await expect(cache.get(17)).resolves.toEqual({
      config: GLOBAL,
      scope: 'global',
    })
  })

  it('treats athletes without category (null/undefined) as the global key', async () => {
    const loader = buildLoader(new Map())
    const cache = new ScopedConfigCache(loader)

    await expect(cache.get(null)).resolves.toEqual({
      config: GLOBAL,
      scope: 'global',
    })
    await cache.get(undefined)

    expect(loader).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledWith(null)
  })

  it('does not cache a failed load', async () => {
    const loader = jest
      .fn()
      .mockRejectedValueOnce(new Error('BD caída'))
      .mockResolvedValueOnce({ config: GLOBAL, scope: 'global' })
    const cache = new ScopedConfigCache<FakeConfig>(loader)

    await expect(cache.get(15)).rejects.toThrow('BD caída')
    await expect(cache.get(15)).resolves.toEqual({
      config: GLOBAL,
      scope: 'global',
    })
    expect(loader).toHaveBeenCalledTimes(2)
  })
})
