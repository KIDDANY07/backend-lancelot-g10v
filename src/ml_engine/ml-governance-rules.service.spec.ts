import { MlEngineMode } from './entities/ml-engine-config.entity'
import {
  ModelActivationCandidate,
  MlGovernanceRulesService,
  ReadinessCriterionCode,
} from './ml-governance-rules.service'

const MINIMUMS = {
  min_labeled_days: 270,
  min_non_contact_injuries: 30,
  min_athletes: 20,
}

const GOOD_MODEL: ModelActivationCandidate = {
  feature_version: 'v1',
  metrics: { pr_auc: 0.31, roc_auc: 0.72 },
  rules_baseline_metrics: { pr_auc: 0.18 },
}

describe('MlGovernanceRulesService', () => {
  let service: MlGovernanceRulesService

  beforeEach(() => {
    service = new MlGovernanceRulesService()
  })

  describe('evaluateReadiness', () => {
    it('is ready when every minimum is reached (boundaries included)', () => {
      const result = service.evaluateReadiness(
        { labeled_days: 270, non_contact_injuries: 30, athletes: 20 },
        MINIMUMS,
      )
      expect(result.ready).toBe(true)
      expect(result.criteria.every((c) => c.met)).toBe(true)
    })

    it('reports each criterion separately and is not ready if one fails', () => {
      const result = service.evaluateReadiness(
        { labeled_days: 300, non_contact_injuries: 12, athletes: 25 },
        MINIMUMS,
      )
      expect(result.ready).toBe(false)
      const injuries = result.criteria.find(
        (c) => c.code === ReadinessCriterionCode.NON_CONTACT_INJURIES,
      )
      expect(injuries).toMatchObject({ value: 12, minimum: 30, met: false })
      expect(
        result.criteria.find((c) => c.code === ReadinessCriterionCode.ATHLETES)
          ?.met,
      ).toBe(true)
    })

    it('is not ready without data', () => {
      expect(
        service.evaluateReadiness(
          { labeled_days: 0, non_contact_injuries: 0, athletes: 0 },
          MINIMUMS,
        ).ready,
      ).toBe(false)
    })
  })

  describe('engineBehavior', () => {
    it('rules: does not call the ML at all', () => {
      expect(service.engineBehavior(MlEngineMode.RULES)).toEqual({
        runMl: false,
        persistPredictions: false,
        createMlAssessments: false,
      })
    })

    it('shadow: stores predictions without visible assessments', () => {
      expect(service.engineBehavior(MlEngineMode.SHADOW)).toEqual({
        runMl: true,
        persistPredictions: true,
        createMlAssessments: false,
      })
    })

    it('ml: stores predictions and creates assessments', () => {
      expect(service.engineBehavior(MlEngineMode.ML)).toEqual({
        runMl: true,
        persistPredictions: true,
        createMlAssessments: true,
      })
    })
  })

  describe('checkEngineChange', () => {
    it('always allows going back to rules', () => {
      expect(
        service.checkEngineChange(MlEngineMode.RULES, {
          hasActiveModel: false,
        }),
      ).toBeNull()
    })

    it('rejects shadow and ml without an active model', () => {
      for (const engine of [MlEngineMode.SHADOW, MlEngineMode.ML])
        expect(
          service.checkEngineChange(engine, { hasActiveModel: false }),
        ).toContain('no hay un modelo de ML activo')
    })

    it('allows shadow and ml with an active model', () => {
      for (const engine of [MlEngineMode.SHADOW, MlEngineMode.ML])
        expect(
          service.checkEngineChange(engine, { hasActiveModel: true }),
        ).toBeNull()
    })
  })

  describe('checkModelActivation', () => {
    it('allows a model that uses the current feature version', () => {
      expect(
        service.checkModelActivation(GOOD_MODEL, {
          currentFeatureVersion: 'v1',
        }),
      ).toEqual([])
    })

    it('rejects a model trained with another feature version', () => {
      const reasons = service.checkModelActivation(
        { ...GOOD_MODEL, feature_version: 'v0' },
        { currentFeatureVersion: 'v1' },
      )
      expect(reasons[0]).toContain('v0')
    })
  })

  describe('activationWarnings', () => {
    it('has no warnings for a model that beats the rules with readiness', () => {
      expect(service.activationWarnings(GOOD_MODEL, { ready: true })).toEqual(
        [],
      )
    })

    it('warns without blocking when the readiness is not met', () => {
      expect(
        service.activationWarnings(GOOD_MODEL, { ready: false })[0],
      ).toContain('readiness')
    })

    it('warns when the model does not beat the rules on PR-AUC (ties included)', () => {
      const warnings = service.activationWarnings(
        {
          ...GOOD_MODEL,
          metrics: { pr_auc: 0.18 },
          rules_baseline_metrics: { pr_auc: 0.18 },
        },
        { ready: true },
      )
      expect(warnings[0]).toContain('no supera a las reglas')
    })

    it('warns when the PR-AUC metrics cannot be compared', () => {
      const warnings = service.activationWarnings(
        { ...GOOD_MODEL, rules_baseline_metrics: null },
        { ready: true },
      )
      expect(warnings[0]).toContain('Faltan las métricas PR-AUC')
    })
  })

  describe('evaluateTalentReadiness', () => {
    const minimums = {
      talent_min_seasons: 2,
      talent_min_promotions: 10,
      talent_min_athletes: 30,
    }

    it('is ready with two labeled seasons, enough promotions and athletes', () => {
      const result = service.evaluateTalentReadiness(
        { labeled_seasons: 2, promotions: 12, athletes: 40 },
        minimums,
      )
      expect(result.ready).toBe(true)
      expect(result.criteria.map((criterion) => criterion.code)).toEqual([
        'temporadas_etiquetadas',
        'ascensos',
        'deportistas',
      ])
    })

    it('is not ready with a single labeled season', () => {
      const result = service.evaluateTalentReadiness(
        { labeled_seasons: 1, promotions: 12, athletes: 40 },
        minimums,
      )
      expect(result.ready).toBe(false)
      expect(result.criteria[0].met).toBe(false)
    })
  })
})
