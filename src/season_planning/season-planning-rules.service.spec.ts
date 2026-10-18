import {
  PlanCategoryInfo,
  PlanFocusDimension,
  SeasonPlanningRulesService,
} from './season-planning-rules.service'

const SUB13: PlanCategoryInfo = {
  id_category: 1,
  name: 'Sub-13',
  min_age: 11,
  max_age: 13,
}
const SUB15: PlanCategoryInfo = {
  id_category: 2,
  name: 'Sub-15',
  min_age: 14,
  max_age: 15,
}
const SUB17: PlanCategoryInfo = {
  id_category: 3,
  name: 'Sub-17',
  min_age: 16,
  max_age: 17,
}
const CATEGORIES = [SUB17, SUB13, SUB15]

describe('SeasonPlanningRulesService', () => {
  const service = new SeasonPlanningRulesService()

  describe('suggestCategory', () => {
    it('keeps the athlete in the category while the age still fits', () => {
      expect(service.suggestCategory(12, 2027, SUB13, CATEGORIES)).toEqual({
        category: SUB13,
        reason: 'Sigue en Sub-13: cumple 12 años en 2027',
      })
    })

    it('moves the athlete up when the age exceeds the current category', () => {
      expect(service.suggestCategory(14, 2027, SUB13, CATEGORIES)).toEqual({
        category: SUB15,
        reason: 'Pasa a Sub-15 por edad: cumple 14 años en 2027',
      })
    })

    it('keeps an athlete already playing above the natural category', () => {
      expect(
        service.suggestCategory(13, 2027, SUB15, CATEGORIES).category,
      ).toBe(SUB15)
    })

    it('cannot suggest without birth date or when every category is too young', () => {
      expect(
        service.suggestCategory(null, 2027, SUB13, CATEGORIES).category,
      ).toBeNull()
      expect(service.suggestCategory(18, 2027, SUB17, CATEGORIES)).toEqual({
        category: null,
        reason:
          'Cumple 18 años en 2027 y supera la edad máxima de todas las categorías del club',
      })
    })

    it('only offers categories whose maximum age is not exceeded', () => {
      expect(
        service.eligibleCategories(14, CATEGORIES).map((c) => c.name),
      ).toEqual(['Sub-15', 'Sub-17'])
    })
  })

  describe('suggestPromotion', () => {
    it('suggests the next category for a reviewed talent flag', () => {
      expect(service.suggestPromotion(SUB13, true, CATEGORIES)).toEqual({
        category: SUB15,
        reason:
          'Señalización de talento revisada: puede entrenar también en Sub-15',
      })
    })

    it('suggests nothing without a reviewed talent flag', () => {
      expect(service.suggestPromotion(SUB13, false, CATEGORIES)).toEqual({
        category: null,
        reason: null,
      })
    })

    it('explains when the athlete is already in the highest category', () => {
      expect(
        service.suggestPromotion(SUB17, true, CATEGORIES).category,
      ).toBeNull()
    })
  })

  describe('focusDimension', () => {
    it('picks the weakest dimension of the index', () => {
      expect(
        service.focusDimension({
          physical_score: 70,
          technical_score: 55,
          tactical_score: 40,
          participation_score: 80,
        }),
      ).toEqual({ dimension: PlanFocusDimension.TACTICA, score: 40 })
    })

    it('ignores tactics when the profile does not weight it', () => {
      expect(
        service.focusDimension({
          physical_score: 70,
          technical_score: 55,
          tactical_score: null,
          participation_score: 80,
        }).dimension,
      ).toBe(PlanFocusDimension.TECNICA)
    })
  })

  describe('carriedTargetDate', () => {
    it('uses the end of the target season when it is known', () => {
      expect(
        service.carriedTargetDate('2026-11-30', '2027-02-01', '2027-11-30'),
      ).toBe('2027-11-30')
    })

    it('keeps a date that already falls inside the target season', () => {
      expect(service.carriedTargetDate('2027-05-01', '2027-02-01', null)).toBe(
        '2027-05-01',
      )
    })

    it('moves an expired date to one year after the target season starts', () => {
      expect(service.carriedTargetDate('2026-11-30', '2027-02-01', null)).toBe(
        '2028-01-31',
      )
    })
  })
})
