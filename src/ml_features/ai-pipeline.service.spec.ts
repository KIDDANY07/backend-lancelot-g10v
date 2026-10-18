import { ConflictException } from '@nestjs/common'
import { Repository } from 'typeorm'
import { FatigueAlert } from 'src/fatigue_alerts/entities/fatigue-alert.entity'
import { FatigueAlertsCronService } from 'src/fatigue_alerts/fatigue-alerts-cron.service'
import { InjuryRiskAssessment } from 'src/injury_risk_assessments/entities/injury-risk-assessment.entity'
import { InjuryRiskAssessmentsCronService } from 'src/injury_risk_assessments/injury-risk-assessments-cron.service'
import { AiPipelineService } from './ai-pipeline.service'
import { MlFeaturesCronService } from './ml-features-cron.service'

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}))
jest.mock('src/fatigue_alerts/fatigue-alerts-cron.service', () => ({
  FatigueAlertsCronService: class {},
}))
jest.mock(
  'src/injury_risk_assessments/injury-risk-assessments-cron.service',
  () => ({ InjuryRiskAssessmentsCronService: class {} }),
)
jest.mock('./ml-features-cron.service', () => ({
  MlFeaturesCronService: class {},
}))

const SUMMARY = { athletes: 3, created: 1, updated: 0, removed: 0, failed: 0 }

function buildService(pipelineDelay = 0) {
  const order: string[] = []
  const fatigue = {
    runForDate: jest.fn(() => {
      order.push('fatiga')
      return Promise.resolve(SUMMARY)
    }),
  }
  const risk = {
    runForDate: jest.fn(() => {
      order.push('riesgo')
      return Promise.reject(new Error('falló la base'))
    }),
  }
  const features = {
    runPipeline: jest.fn(async () => {
      order.push('variables')
      await new Promise((resolve) => setTimeout(resolve, pipelineDelay))
      return {
        snapshot: { athletes: 3, snapshots: 3, failed: 0 },
        inference: {
          engine: 'rules',
          predicted: 0,
          assessments_created: 0,
          failed: 0,
        },
        labels: { processed: 0, labeled_positive: 0, unknown_mechanism: 0 },
        talent_dataset: {
          rows: 0,
          labeled: 0,
          promoted: 0,
          pending: 0,
          excluded: 0,
          removed: 0,
        },
      }
    }),
  }
  const service = new AiPipelineService(
    {
      count: jest.fn().mockResolvedValue(2),
    } as unknown as Repository<FatigueAlert>,
    {
      count: jest.fn().mockResolvedValue(1),
    } as unknown as Repository<InjuryRiskAssessment>,
    fatigue as unknown as FatigueAlertsCronService,
    risk as unknown as InjuryRiskAssessmentsCronService,
    features as unknown as MlFeaturesCronService,
  )
  return { service, order, fatigue, features }
}

describe('AiPipelineService', () => {
  it('runs the nightly steps in order for today and keeps going after a failed step', async () => {
    const { service, order, fatigue } = buildService()
    const result = await service.runNow()

    expect(order).toEqual(['fatiga', 'riesgo', 'variables'])
    expect(fatigue.runForDate).toHaveBeenCalledWith(result.date)
    expect(result.fatigue_alerts).toEqual(SUMMARY)
    expect(result.risk_assessments).toEqual({ error: 'falló la base' })
    expect(result.open_today).toEqual({
      fatigue_alerts: 2,
      risk_assessments: 1,
    })
  })

  it('rejects a second run while the first one is still working', async () => {
    const { service } = buildService(30)
    const first = service.runNow()
    await expect(service.runNow()).rejects.toThrow(ConflictException)
    await first
    await expect(service.runNow()).resolves.toMatchObject({ status: 'Success' })
  })
})
