import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  AthleteSeasonFeatures,
  TALENT_FEATURE_VERSION,
  TalentLabelQuality,
} from 'src/ml_features/entities/athlete-season-features.entity'
import { MlEngineConfig } from './entities/ml-engine-config.entity'
import {
  MlGovernanceRulesService,
  ReadinessResult,
  TalentReadinessMinimums,
} from './ml-governance-rules.service'

export const DEFAULT_TALENT_READINESS_MINIMUMS: TalentReadinessMinimums = {
  talent_min_seasons: 2,
  talent_min_promotions: 10,
  talent_min_athletes: 30,
}

export interface TalentReadinessReport extends ReadinessResult {
  feature_version: string
  labeled_rows: number
  pending_rows: number
}

@Injectable()
export class TalentReadinessService {
  constructor(
    @InjectRepository(AthleteSeasonFeatures)
    private readonly seasonFeaturesRepository: Repository<AthleteSeasonFeatures>,
    @InjectRepository(MlEngineConfig)
    private readonly mlEngineConfigRepository: Repository<MlEngineConfig>,
    private readonly mlGovernanceRulesService: MlGovernanceRulesService,
  ) {}

  private async getMinimums(): Promise<TalentReadinessMinimums> {
    const [config] = await this.mlEngineConfigRepository.find({
      order: { id_config: 'ASC' },
      take: 1,
    })
    if (!config) return DEFAULT_TALENT_READINESS_MINIMUMS
    return {
      talent_min_seasons: Number(config.talent_min_seasons),
      talent_min_promotions: Number(config.talent_min_promotions),
      talent_min_athletes: Number(config.talent_min_athletes),
    }
  }

  async evaluate(): Promise<TalentReadinessReport> {
    const stats = (await this.seasonFeaturesRepository
      .createQueryBuilder('features')
      .select(
        'COUNT(*) FILTER (WHERE features.label_quality = :labeled)',
        'labeled_rows',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE features.label_quality = :pending)',
        'pending_rows',
      )
      .addSelect(
        'COUNT(DISTINCT features.id_season) FILTER (WHERE features.label_quality = :labeled)',
        'labeled_seasons',
      )
      .addSelect(
        'COUNT(DISTINCT features.id_user) FILTER (WHERE features.label_quality = :labeled)',
        'athletes',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE features.label_quality = :labeled AND features.label_promoted = true)',
        'promotions',
      )
      .where('features.feature_version = :version', {
        version: TALENT_FEATURE_VERSION,
      })
      .setParameters({
        labeled: TalentLabelQuality.LABELED,
        pending: TalentLabelQuality.PENDING,
      })
      .getRawOne<{
        labeled_rows: string
        pending_rows: string
        labeled_seasons: string
        athletes: string
        promotions: string
      }>()) ?? {
      labeled_rows: '0',
      pending_rows: '0',
      labeled_seasons: '0',
      athletes: '0',
      promotions: '0',
    }

    const result = this.mlGovernanceRulesService.evaluateTalentReadiness(
      {
        labeled_seasons: Number(stats.labeled_seasons),
        promotions: Number(stats.promotions),
        athletes: Number(stats.athletes),
      },
      await this.getMinimums(),
    )
    return {
      ...result,
      feature_version: TALENT_FEATURE_VERSION,
      labeled_rows: Number(stats.labeled_rows),
      pending_rows: Number(stats.pending_rows),
    }
  }

  async getReadinessResponse() {
    const readiness = await this.evaluate()
    return {
      status: 'Success',
      mensaje: readiness.ready
        ? 'Hay datos suficientes para entrenar y activar un modelo de talento'
        : 'Aún no hay temporadas suficientes con ascensos reales; la detección de talento sigue con las reglas',
      readiness,
    }
  }
}
