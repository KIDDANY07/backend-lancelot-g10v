import { ValidationMetricsService } from './validation-metrics.service'

const LEVELS = ['bajo', 'medio', 'alto']
const STATUSES = ['open', 'reviewed', 'dismissed']
const TODAY = '2026-10-01'

describe('ValidationMetricsService', () => {
  let service: ValidationMetricsService

  beforeEach(() => {
    service = new ValidationMetricsService()
  })

  describe('summarizeReviews', () => {
    it('counts by level and status and computes the dismissal rate', () => {
      const summary = service.summarizeReviews(
        [
          { level: 'alto', status: 'dismissed' },
          { level: 'medio', status: 'reviewed' },
          { level: 'medio', status: 'reviewed' },
          { level: 'alto', status: 'reviewed' },
          { level: 'medio', status: 'open' },
        ],
        LEVELS,
        STATUSES,
        'Alertas de fatiga',
      )
      expect(summary).toEqual({
        total: 5,
        by_level: { bajo: 0, medio: 3, alto: 2 },
        by_status: { open: 1, reviewed: 3, dismissed: 1 },
        dismissal_rate: 25,
        warnings: [],
      })
    })

    it('returns null and a warning when nothing was reviewed or dismissed', () => {
      const summary = service.summarizeReviews(
        [{ level: 'alto', status: 'open' }],
        LEVELS,
        STATUSES,
        'Alertas de fatiga',
      )
      expect(summary.dismissal_rate).toBeNull()
      expect(summary.warnings[0]).toContain('Alertas de fatiga')
    })
  })

  describe('sensitivity', () => {
    const injuries = [
      { id_user: 1, injury_date: '2026-03-10' },
      { id_user: 2, injury_date: '2026-03-10' },
      { id_user: 3, injury_date: '2026-03-10' },
      { id_user: 4, injury_date: '2026-03-10' },
    ]

    it('counts injuries preceded by a medium/high alert of the same athlete in the 7 previous days', () => {
      const result = service.sensitivity(
        injuries,
        [
          { id_user: 1, date: '2026-03-03', level: 'medio' },
          { id_user: 2, date: '2026-03-09', level: 'alto' },
          { id_user: 3, date: '2026-03-02', level: 'alto' },
          { id_user: 4, date: '2026-03-10', level: 'alto' },
          { id_user: 9, date: '2026-03-08', level: 'alto' },
        ],
        'Fase 1',
      )
      expect(result).toEqual({
        injuries: 4,
        preceded_by_alert: 2,
        sensitivity: 50,
        warnings: [],
      })
    })

    it('ignores low-level signals', () => {
      const result = service.sensitivity(
        [injuries[0]],
        [{ id_user: 1, date: '2026-03-08', level: 'bajo' }],
        'Fase 1',
      )
      expect(result.sensitivity).toBe(0)
    })

    it('returns null and a warning without non-contact injuries', () => {
      const result = service.sensitivity([], [], 'Fase 1')
      expect(result.sensitivity).toBeNull()
      expect(result.warnings[0]).toContain('no se calcula la sensibilidad')
    })
  })

  describe('positivePredictiveValue', () => {
    it('counts medium/high alerts followed by an injury of the same athlete in the next 7 days', () => {
      const result = service.positivePredictiveValue(
        [
          { id_user: 1, date: '2026-03-01', level: 'alto' },
          { id_user: 2, date: '2026-03-01', level: 'medio' },
          { id_user: 3, date: '2026-03-01', level: 'medio' },
          { id_user: 4, date: '2026-03-01', level: 'bajo' },
        ],
        [
          { id_user: 1, injury_date: '2026-03-08' },
          { id_user: 2, injury_date: '2026-03-09' },
          { id_user: 3, injury_date: '2026-03-01' },
          { id_user: 4, injury_date: '2026-03-02' },
        ],
        TODAY,
        'Fase 1',
      )
      expect(result).toEqual({
        alerts: 3,
        followed_by_injury: 1,
        positive_predictive_value: 33.33,
        pending_window: 0,
        warnings: [],
      })
    })

    it('excludes alerts whose 7-day window has not finished and warns about them', () => {
      const result = service.positivePredictiveValue(
        [
          { id_user: 1, date: '2026-09-20', level: 'alto' },
          { id_user: 1, date: '2026-09-28', level: 'alto' },
        ],
        [],
        TODAY,
        'Fase 1',
      )
      expect(result.alerts).toBe(1)
      expect(result.pending_window).toBe(1)
      expect(result.positive_predictive_value).toBe(0)
      expect(result.warnings[0]).toContain('1 alertas recientes')
    })

    it('returns null and a warning without evaluable alerts', () => {
      const result = service.positivePredictiveValue([], [], TODAY, 'ML')
      expect(result.positive_predictive_value).toBeNull()
      expect(result.warnings[0]).toContain('ML')
    })
  })

  describe('talentAcceptance', () => {
    it('computes the acceptance rate per source', () => {
      const result = service.talentAcceptance(
        [
          { source: 'rules', status: 'reviewed' },
          { source: 'rules', status: 'reviewed' },
          { source: 'rules', status: 'reviewed' },
          { source: 'rules', status: 'dismissed' },
          { source: 'rules', status: 'open' },
          { source: 'manual', status: 'reviewed' },
        ],
        ['manual', 'rules', 'ml'],
        STATUSES,
      )
      expect(result.by_source.rules).toEqual({
        total: 5,
        by_status: { open: 1, reviewed: 3, dismissed: 1 },
        acceptance_rate: 75,
      })
      expect(result.by_source.manual.acceptance_rate).toBe(100)
      expect(result.by_source.ml).toEqual({
        total: 0,
        by_status: { open: 0, reviewed: 0, dismissed: 0 },
        acceptance_rate: null,
      })
      expect(result.warnings).toEqual([])
    })

    it('warns when a source has flags but none was decided', () => {
      const result = service.talentAcceptance(
        [{ source: 'rules', status: 'open' }],
        ['rules'],
        STATUSES,
      )
      expect(result.by_source.rules.acceptance_rate).toBeNull()
      expect(result.warnings[0]).toContain('rules')
    })
  })

  describe('agreement', () => {
    it('compares ML and rules treating medium/high as positive and no alert as negative', () => {
      const result = service.agreement([
        { risk_level: 'alto', rules_risk_level: 'medio' },
        { risk_level: 'bajo', rules_risk_level: null },
        { risk_level: 'medio', rules_risk_level: null },
        { risk_level: 'bajo', rules_risk_level: 'alto' },
      ])
      expect(result).toEqual({
        compared: 4,
        both_positive: 1,
        both_negative: 1,
        only_ml_positive: 1,
        only_rules_positive: 1,
        agreement: 50,
        warnings: [],
      })
    })

    it('returns null and a warning without predictions', () => {
      const result = service.agreement([])
      expect(result.agreement).toBeNull()
      expect(result.warnings[0]).toContain('Modo sombra')
    })
  })
})
