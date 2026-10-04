import {
  DEFAULT_TALENT_DETECTION_THRESHOLDS,
  PRIORITY_FOLLOW_UP_ACTION,
  TalentCategoryInfo,
  TalentCriterionCode,
  TalentDetectionInput,
  TalentDetectionRulesService,
} from './talent-detection-rules.service'

const SUB13: TalentCategoryInfo = {
  id_category: 1,
  name: 'Sub-13',
  min_age: 11,
  max_age: 13,
}
const SUB15: TalentCategoryInfo = {
  id_category: 2,
  name: 'Sub-15',
  min_age: 13,
  max_age: 15,
}
const SUB17: TalentCategoryInfo = {
  id_category: 3,
  name: 'Sub-17',
  min_age: 15,
  max_age: 17,
}
const CATEGORIES = [SUB17, SUB13, SUB15]

const REFERENCE_DATE = new Date('2026-11-30T00:00:00Z')

function baseInput(
  overrides: Partial<TalentDetectionInput> = {},
): TalentDetectionInput {
  return {
    index_value: 78,
    percentile: 90,
    cohort_size: 20,
    physical_score: 70,
    technical_score: 75,
    participation_score: 80,
    previous_index_value: 70,
    had_severe_injury: false,
    birth_date: '2013-07-15',
    reference_date: REFERENCE_DATE,
    category: SUB15,
    categories: CATEGORIES,
    thresholds: { ...DEFAULT_TALENT_DETECTION_THRESHOLDS },
    ...overrides,
  }
}

describe('TalentDetectionRulesService', () => {
  let service: TalentDetectionRulesService

  beforeEach(() => {
    service = new TalentDetectionRulesService()
  })

  describe('flagging', () => {
    it('flags an athlete meeting both mandatory criteria and both supporting criteria', () => {
      const result = service.evaluate(baseInput())
      expect(result.flagged).toBe(true)
      expect(result.triggered_criteria).toEqual([
        TalentCriterionCode.HIGH_PERCENTILE,
        TalentCriterionCode.MULTIDIMENSIONAL_PROFILE,
        TalentCriterionCode.SUSTAINED_IMPROVEMENT,
        TalentCriterionCode.AVAILABILITY,
      ])
      expect(result.score).toBe(90)
      expect(result.warnings).toEqual([])
    })

    it('uses the percentile (rounded to 2 decimals) as score', () => {
      expect(service.evaluate(baseInput({ percentile: 85.456 })).score).toBe(
        85.46,
      )
    })
  })

  describe('percentil_alto (mandatory)', () => {
    it('triggers at exactly min_percentile', () => {
      const result = service.evaluate(baseInput({ percentile: 80 }))
      expect(result.triggered_criteria).toContain(
        TalentCriterionCode.HIGH_PERCENTILE,
      )
      expect(result.flagged).toBe(true)
    })

    it('does not trigger below min_percentile and blocks the flag', () => {
      const result = service.evaluate(baseInput({ percentile: 79.99 }))
      expect(result.triggered_criteria).not.toContain(
        TalentCriterionCode.HIGH_PERCENTILE,
      )
      expect(result.flagged).toBe(false)
    })

    it('respects a configured min_percentile', () => {
      const thresholds = {
        ...DEFAULT_TALENT_DETECTION_THRESHOLDS,
        min_percentile: 95,
      }
      expect(service.evaluate(baseInput({ thresholds })).flagged).toBe(false)
    })
  })

  describe('perfil_multidimensional (mandatory)', () => {
    it('does not trigger when any single dimension is below the floor, even with a high index', () => {
      const result = service.evaluate(
        baseInput({ technical_score: 39.99, percentile: 99 }),
      )
      expect(result.triggered_criteria).not.toContain(
        TalentCriterionCode.MULTIDIMENSIONAL_PROFILE,
      )
      expect(result.flagged).toBe(false)
    })

    it('triggers when the weakest dimension is exactly min_dimension_score', () => {
      const result = service.evaluate(baseInput({ physical_score: 40 }))
      expect(result.triggered_criteria).toContain(
        TalentCriterionCode.MULTIDIMENSIONAL_PROFILE,
      )
    })

    it('respects a configured min_dimension_score', () => {
      const thresholds = {
        ...DEFAULT_TALENT_DETECTION_THRESHOLDS,
        min_dimension_score: 72,
      }
      const result = service.evaluate(baseInput({ thresholds }))
      expect(result.triggered_criteria).not.toContain(
        TalentCriterionCode.MULTIDIMENSIONAL_PROFILE,
      )
    })
  })

  describe('mejora_sostenida (supporting)', () => {
    it('triggers when the delta reaches min_improvement_delta', () => {
      const result = service.evaluate(
        baseInput({ index_value: 75, previous_index_value: 70 }),
      )
      expect(result.triggered_criteria).toContain(
        TalentCriterionCode.SUSTAINED_IMPROVEMENT,
      )
    })

    it('does not trigger with a smaller (or negative) delta', () => {
      const result = service.evaluate(
        baseInput({ index_value: 68, previous_index_value: 70 }),
      )
      expect(result.triggered_criteria).not.toContain(
        TalentCriterionCode.SUSTAINED_IMPROVEMENT,
      )
      expect(result.criteria_text).toContain('Mejora de -2.00 puntos')
    })

    it('does not count without a previous season and adds a warning', () => {
      const result = service.evaluate(baseInput({ previous_index_value: null }))
      expect(result.triggered_criteria).not.toContain(
        TalentCriterionCode.SUSTAINED_IMPROVEMENT,
      )
      expect(result.warnings).toContain(
        'Sin índice de la temporada anterior: no se evaluó la mejora sostenida',
      )
      expect(result.flagged).toBe(true)
    })
  })

  describe('disponibilidad (supporting)', () => {
    it('does not trigger with participation below the minimum', () => {
      const result = service.evaluate(
        baseInput({ participation_score: 49, physical_score: 70 }),
      )
      expect(result.triggered_criteria).not.toContain(
        TalentCriterionCode.AVAILABILITY,
      )
    })

    it('does not trigger with a severe injury when exclude_severe_injury is on', () => {
      const result = service.evaluate(baseInput({ had_severe_injury: true }))
      expect(result.triggered_criteria).not.toContain(
        TalentCriterionCode.AVAILABILITY,
      )
      expect(result.criteria_text).toContain('con lesión severa')
    })

    it('ignores the severe injury when exclude_severe_injury is off', () => {
      const thresholds = {
        ...DEFAULT_TALENT_DETECTION_THRESHOLDS,
        exclude_severe_injury: false,
      }
      const result = service.evaluate(
        baseInput({ had_severe_injury: true, thresholds }),
      )
      expect(result.triggered_criteria).toContain(
        TalentCriterionCode.AVAILABILITY,
      )
    })
  })

  describe('min_supporting_criteria', () => {
    it('does not flag when no supporting criterion is met', () => {
      const result = service.evaluate(
        baseInput({ previous_index_value: null, had_severe_injury: true }),
      )
      expect(result.triggered_criteria).toEqual([
        TalentCriterionCode.HIGH_PERCENTILE,
        TalentCriterionCode.MULTIDIMENSIONAL_PROFILE,
      ])
      expect(result.flagged).toBe(false)
    })

    it('requires both supporting criteria when configured to 2', () => {
      const thresholds = {
        ...DEFAULT_TALENT_DETECTION_THRESHOLDS,
        min_supporting_criteria: 2,
      }
      expect(service.evaluate(baseInput({ thresholds })).flagged).toBe(true)
      expect(
        service.evaluate(baseInput({ thresholds, had_severe_injury: true }))
          .flagged,
      ).toBe(false)
    })

    it('flags on mandatory criteria alone when configured to 0', () => {
      const thresholds = {
        ...DEFAULT_TALENT_DETECTION_THRESHOLDS,
        min_supporting_criteria: 0,
      }
      const result = service.evaluate(
        baseInput({
          thresholds,
          previous_index_value: null,
          had_severe_injury: true,
        }),
      )
      expect(result.flagged).toBe(true)
    })
  })

  describe('recommended_action (maturation context)', () => {
    it('suggests promotion to the next category when the athlete reaches the max age within the window', () => {
      const result = service.evaluate(baseInput({ birth_date: '2012-03-10' }))
      expect(result.recommended_action).toBe('Evaluar ascenso a Sub-17')
    })

    it('also suggests promotion when the athlete already reached the max age', () => {
      const result = service.evaluate(baseInput({ birth_date: '2011-07-15' }))
      expect(result.recommended_action).toBe('Evaluar ascenso a Sub-17')
    })

    it('suggests priority follow-up when the max age is beyond the window', () => {
      const result = service.evaluate(baseInput({ birth_date: '2013-07-15' }))
      expect(result.recommended_action).toBe(PRIORITY_FOLLOW_UP_ACTION)
    })

    it('respects a configured near_max_age_months', () => {
      const thresholds = {
        ...DEFAULT_TALENT_DETECTION_THRESHOLDS,
        near_max_age_months: 24,
      }
      const result = service.evaluate(
        baseInput({ birth_date: '2013-07-15', thresholds }),
      )
      expect(result.recommended_action).toBe('Evaluar ascenso a Sub-17')
    })

    it('picks the category with the smallest min_age above the current one', () => {
      const result = service.evaluate(
        baseInput({ category: SUB13, birth_date: '2013-08-01' }),
      )
      expect(result.recommended_action).toBe('Evaluar ascenso a Sub-15')
    })

    it('keeps follow-up and warns when there is no higher category', () => {
      const result = service.evaluate(
        baseInput({ category: SUB17, birth_date: '2009-07-15' }),
      )
      expect(result.recommended_action).toBe(PRIORITY_FOLLOW_UP_ACTION)
      expect(result.warnings).toContain(
        'Cumple la edad máxima de su categoría pero no hay una categoría superior configurada',
      )
    })
  })

  describe('relative age effect', () => {
    it('warns when born in the first quarter', () => {
      for (const birth_date of ['2013-01-01', '2013-02-15', '2013-03-31']) {
        expect(service.evaluate(baseInput({ birth_date })).warnings).toContain(
          'Posible efecto de edad relativa: nacido en el primer trimestre',
        )
      }
    })

    it('does not warn when born from April on', () => {
      const result = service.evaluate(baseInput({ birth_date: '2013-04-01' }))
      expect(result.warnings).not.toContain(
        'Posible efecto de edad relativa: nacido en el primer trimestre',
      )
    })

    it('does not change the flag decision', () => {
      expect(
        service.evaluate(baseInput({ birth_date: '2013-02-01' })).flagged,
      ).toBe(service.evaluate(baseInput({ birth_date: '2013-08-01' })).flagged)
    })
  })

  describe('missing birth_date', () => {
    it('warns, skips the age context and keeps priority follow-up', () => {
      const result = service.evaluate(baseInput({ birth_date: null }))
      expect(result.recommended_action).toBe(PRIORITY_FOLLOW_UP_ACTION)
      expect(result.warnings).toEqual([
        'Sin fecha de nacimiento: no se evaluó la proximidad a la edad máxima de la categoría ni el efecto de edad relativa',
      ])
      expect(result.flagged).toBe(true)
    })
  })

  describe('cohort size', () => {
    it('warns when the cohort is small', () => {
      const result = service.evaluate(baseInput({ cohort_size: 3 }))
      expect(result.warnings).toContain(
        'Cohorte pequeña (3 deportistas): el percentil es poco estable',
      )
    })
  })

  describe('criteria_text', () => {
    it('is readable Spanish with the concrete values', () => {
      const { criteria_text } = service.evaluate(baseInput())
      expect(criteria_text).toContain(
        'Percentil 90.00 del índice (78.00) en su cohorte (mínimo 80): cumple',
      )
      expect(criteria_text).toContain(
        'físico 70.00; técnico 75.00; participación 80.00 (mínimo 40 en cada dimensión): cumple',
      )
      expect(criteria_text).toContain(
        'Mejora de +8.00 puntos frente a la temporada anterior (mínimo 5): cumple',
      )
      expect(criteria_text).toContain(
        'Disponibilidad: participación 80.00 (mínimo 50) sin lesión severa: cumple',
      )
    })
  })
})
