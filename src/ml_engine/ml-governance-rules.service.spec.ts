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
  is_synthetic: false,
  feature_version: 'v1',
  metrics: { pr_auc: 0.31, roc_auc: 0.72 },
  rules_baseline_metrics: { pr_auc: 0.18 },
}

const READY = { ready: true, currentFeatureVersion: 'v1' }

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
          ready: false,
        }),
      ).toBeNull()
    })

    it('rejects shadow and ml without an active model', () => {
      for (const engine of [MlEngineMode.SHADOW, MlEngineMode.ML])
        expect(
          service.checkEngineChange(engine, {
            hasActiveModel: false,
            ready: true,
          }),
        ).toContain('no hay un modelo de ML activo')
    })

    it('allows shadow with an active model even without readiness', () => {
      expect(
        service.checkEngineChange(MlEngineMode.SHADOW, {
          hasActiveModel: true,
          ready: false,
        }),
      ).toBeNull()
    })

    it('rejects ml without readiness and allows it with readiness', () => {
      expect(
        service.checkEngineChange(MlEngineMode.ML, {
          hasActiveModel: true,
          ready: false,
        }),
      ).toContain('readiness')
      expect(
        service.checkEngineChange(MlEngineMode.ML, {
          hasActiveModel: true,
          ready: true,
        }),
      ).toBeNull()
    })
  })

  describe('checkModelActivation', () => {
    it('allows a real model that beats the rules with readiness', () => {
      expect(service.checkModelActivation(GOOD_MODEL, READY)).toEqual([])
    })

    it('never allows a synthetic model', () => {
      const reasons = service.checkModelActivation(
        { ...GOOD_MODEL, is_synthetic: true },
        READY,
      )
      expect(reasons).toHaveLength(1)
      expect(reasons[0]).toContain('sintéticos')
    })

    it('rejects activation without readiness', () => {
      expect(
        service.checkModelActivation(GOOD_MODEL, { ...READY, ready: false }),
      ).toEqual([
        'No se cumplen los mínimos de datos (readiness) para usar un modelo de ML',
      ])
    })

    it('rejects a model that does not beat the rules on PR-AUC (ties included)', () => {
      const reasons = service.checkModelActivation(
        {
          ...GOOD_MODEL,
          metrics: { pr_auc: 0.18 },
          rules_baseline_metrics: { pr_auc: 0.18 },
        },
        READY,
      )
      expect(reasons[0]).toContain('no supera a las reglas')
    })

    it('rejects a model without comparable PR-AUC metrics', () => {
      const reasons = service.checkModelActivation(
        { ...GOOD_MODEL, rules_baseline_metrics: null },
        READY,
      )
      expect(reasons[0]).toContain('Faltan las métricas PR-AUC')
    })

    it('rejects a model trained with another feature version', () => {
      const reasons = service.checkModelActivation(
        { ...GOOD_MODEL, feature_version: 'v0' },
        READY,
      )
      expect(reasons[0]).toContain('v0')
    })

    it('accumulates every failing reason', () => {
      const reasons = service.checkModelActivation(
        {
          is_synthetic: true,
          feature_version: 'v0',
          metrics: { pr_auc: 0.1 },
          rules_baseline_metrics: { pr_auc: 0.2 },
        },
        { ready: false, currentFeatureVersion: 'v1' },
      )
      expect(reasons).toHaveLength(4)
    })
  })
})
