import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Repository } from 'typeorm'
import { CategoriesService } from 'src/categories/categories.service'
import { AcwrConfigService } from './acwr-config.service'
import { AcwrThreshold } from './entities/acwr-threshold.entity'

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}))

const GLOBAL = {
  id_threshold: 1,
  id_category: null,
  low_min: 0.8,
  low_max: 1.3,
  medium_max: 1.5,
} as AcwrThreshold

const SUB15 = {
  id_threshold: 2,
  id_category: 15,
  low_min: 0.7,
  low_max: 1.4,
  medium_max: 1.6,
} as AcwrThreshold

function buildService(rows: AcwrThreshold[]) {
  const repository = {
    find: jest.fn(() =>
      Promise.resolve(rows.filter((row) => row.id_category == null)),
    ),
    findOne: jest.fn(({ where }: { where: { id_category: number } }) =>
      Promise.resolve(
        rows.find((row) => row.id_category === where.id_category) ?? null,
      ),
    ),
    create: jest.fn((data: Partial<AcwrThreshold>) => ({ ...data })),
    merge: jest.fn((target: AcwrThreshold, source: Partial<AcwrThreshold>) =>
      Object.assign(target, source),
    ),
    save: jest.fn((data: AcwrThreshold) => Promise.resolve(data)),
    remove: jest.fn(() => Promise.resolve()),
  }
  const categoriesService = {
    findOneById: jest.fn((id_category: number) =>
      Promise.resolve(id_category === 404 ? null : { id_category }),
    ),
  }
  const service = new AcwrConfigService(
    repository as unknown as Repository<AcwrThreshold>,
    categoriesService as unknown as CategoriesService,
  )
  return { service, repository }
}

describe('AcwrConfigService', () => {
  describe('getActive', () => {
    it('returns the global config when no category is given', async () => {
      const { service } = buildService([GLOBAL, SUB15])
      await expect(service.getActive()).resolves.toEqual({
        config: GLOBAL,
        scope: 'global',
      })
    })

    it('returns the category override when it exists', async () => {
      const { service, repository } = buildService([GLOBAL, SUB15])
      await expect(service.getActive(15)).resolves.toEqual({
        config: SUB15,
        scope: 'category',
      })
      expect(repository.find).not.toHaveBeenCalled()
    })

    it('falls back to the global config when the category has no override', async () => {
      const { service } = buildService([GLOBAL, SUB15])
      await expect(service.getActive(17)).resolves.toEqual({
        config: GLOBAL,
        scope: 'global',
      })
    })
  })

  describe('update', () => {
    it('creates a category override starting from the global values', async () => {
      const { service, repository } = buildService([{ ...GLOBAL }])
      const result = await service.update({ medium_max: 1.7 }, 17)

      expect(repository.create).toHaveBeenCalledWith({
        id_category: 17,
        low_min: 0.8,
        low_max: 1.3,
        medium_max: 1.5,
      })
      expect(result.threshold).toMatchObject({
        id_category: 17,
        scope: 'category',
        low_min: 0.8,
        low_max: 1.3,
        medium_max: 1.7,
      })
      expect(result.mensaje).toContain('creados')
    })

    it('updates the global config when no category is given', async () => {
      const { service, repository } = buildService([{ ...GLOBAL }])
      const result = await service.update({ low_max: 1.2 })

      expect(repository.create).not.toHaveBeenCalled()
      expect(result.threshold).toMatchObject({
        id_category: null,
        scope: 'global',
        low_max: 1.2,
      })
    })

    it('rejects an override that breaks low_min < low_max < medium_max', async () => {
      const { service } = buildService([{ ...GLOBAL }])
      await expect(service.update({ low_max: 1.6 }, 17)).rejects.toThrow(
        BadRequestException,
      )
    })

    it('rejects an unknown category', async () => {
      const { service } = buildService([{ ...GLOBAL }])
      await expect(service.update({ low_max: 1.2 }, 404)).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('deleteCategoryOverride', () => {
    it('never deletes the global config', async () => {
      const { service, repository } = buildService([GLOBAL])
      await expect(service.deleteCategoryOverride()).rejects.toThrow(
        BadRequestException,
      )
      expect(repository.remove).not.toHaveBeenCalled()
    })

    it('deletes an existing category override', async () => {
      const { service, repository } = buildService([GLOBAL, SUB15])
      await service.deleteCategoryOverride(15)
      expect(repository.remove).toHaveBeenCalledWith(SUB15)
    })

    it('fails when the category has no override', async () => {
      const { service } = buildService([GLOBAL])
      await expect(service.deleteCategoryOverride(17)).rejects.toThrow(
        NotFoundException,
      )
    })
  })
})
