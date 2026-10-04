import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { addDaysToKey } from 'src/common/utils/date.util'
import { Injury, InjuryMechanism } from 'src/injuries/entities/injury.entity'
import {
  AthleteDailyFeatures,
  FEATURE_VERSION,
  FeatureLabelQuality,
} from 'src/ml_features/entities/athlete-daily-features.entity'
import { LABEL_WINDOW_DAYS } from 'src/ml_features/feature-calculator.service'
import { MlEngineConfig } from './entities/ml-engine-config.entity'
import {
  MlGovernanceRulesService,
  ReadinessMinimums,
  ReadinessResult,
} from './ml-governance-rules.service'

export const DEFAULT_READINESS_MINIMUMS: ReadinessMinimums = {
  min_labeled_days: 270,
  min_non_contact_injuries: 30,
  min_athletes: 20,
}

export interface ReadinessReport extends ReadinessResult {
  feature_version: string
  labeled_rows: number
  positive_labels: number
  labeled_period: { from: string | null; to: string | null }
}

@Injectable()
export class MlReadinessService {
  constructor(
    @InjectRepository(AthleteDailyFeatures)
    private readonly featuresRepository: Repository<AthleteDailyFeatures>,
    @InjectRepository(Injury)
    private readonly injuriesRepository: Repository<Injury>,
    @InjectRepository(MlEngineConfig)
    private readonly mlEngineConfigRepository: Repository<MlEngineConfig>,
    private readonly mlGovernanceRulesService: MlGovernanceRulesService,
  ) {}

  private async getMinimums(): Promise<ReadinessMinimums> {
    const [config] = await this.mlEngineConfigRepository.find({
      order: { id_config: 'ASC' },
      take: 1,
    })
    if (!config) return DEFAULT_READINESS_MINIMUMS
    return {
      min_labeled_days: Number(config.min_labeled_days),
      min_non_contact_injuries: Number(config.min_non_contact_injuries),
      min_athletes: Number(config.min_athletes),
    }
  }

  async evaluate(): Promise<ReadinessReport> {
    const stats = (await this.featuresRepository
      .createQueryBuilder('features')
      .select('COUNT(*)', 'labeled_rows')
      .addSelect('COUNT(DISTINCT features.date)', 'labeled_days')
      .addSelect('COUNT(DISTINCT features.id_user)', 'athletes')
      .addSelect(
        'COUNT(*) FILTER (WHERE features.label_injury_7d = true)',
        'positive_labels',
      )
      .addSelect("TO_CHAR(MIN(features.date), 'YYYY-MM-DD')", 'min_date')
      .addSelect("TO_CHAR(MAX(features.date), 'YYYY-MM-DD')", 'max_date')
      .where('features.label_quality = :quality', {
        quality: FeatureLabelQuality.LABELED,
      })
      .andWhere('features.feature_version = :version', {
        version: FEATURE_VERSION,
      })
      .getRawOne<{
        labeled_rows: string
        labeled_days: string
        athletes: string
        positive_labels: string
        min_date: string | null
        max_date: string | null
      }>()) ?? {
      labeled_rows: '0',
      labeled_days: '0',
      athletes: '0',
      positive_labels: '0',
      min_date: null,
      max_date: null,
    }

    let nonContactInjuries = 0
    if (stats.min_date && stats.max_date)
      nonContactInjuries = await this.injuriesRepository
        .createQueryBuilder('injury')
        .where('injury.mechanism = :mechanism', {
          mechanism: InjuryMechanism.SIN_CONTACTO,
        })
        .andWhere('injury.injury_date > :from', { from: stats.min_date })
        .andWhere('injury.injury_date <= :to', {
          to: addDaysToKey(stats.max_date, LABEL_WINDOW_DAYS),
        })
        .getCount()

    const result = this.mlGovernanceRulesService.evaluateReadiness(
      {
        labeled_days: Number(stats.labeled_days),
        non_contact_injuries: nonContactInjuries,
        athletes: Number(stats.athletes),
      },
      await this.getMinimums(),
    )
    return {
      ...result,
      feature_version: FEATURE_VERSION,
      labeled_rows: Number(stats.labeled_rows),
      positive_labels: Number(stats.positive_labels),
      labeled_period: { from: stats.min_date, to: stats.max_date },
    }
  }

  async getReadinessResponse() {
    const readiness = await this.evaluate()
    return {
      status: 'Success',
      mensaje: readiness.ready
        ? 'Hay datos suficientes para entrenar y activar un modelo de ML'
        : 'Aún no hay datos suficientes para la fase 2 (ML); el sistema sigue con las reglas de la fase 1',
      readiness,
    }
  }
}
