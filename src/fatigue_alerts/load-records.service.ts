import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { MatchStatistic } from 'src/match_statistics/entities/match-statistic.entity'
import { TrainingLoad } from 'src/training_loads/entities/training-load.entity'
import { TrainingLoadRecord } from './acwr-calculator.service'

@Injectable()
export class LoadRecordsService {
  constructor(
    @InjectRepository(TrainingLoad)
    private readonly trainingLoadsRepository: Repository<TrainingLoad>,
    @InjectRepository(MatchStatistic)
    private readonly matchStatisticsRepository: Repository<MatchStatistic>,
  ) {}

  async getRecords(
    id_user: number,
    from: string,
    to: string,
  ): Promise<TrainingLoadRecord[]> {
    const [trainingLoads, matchStats] = await Promise.all([
      this.trainingLoadsRepository
        .createQueryBuilder('load')
        .innerJoinAndSelect('load.session', 'session')
        .where('load.id_user = :id_user', { id_user })
        .andWhere('session.date >= :from', { from })
        .andWhere('session.date <= :to', { to })
        .getMany(),
      this.matchStatisticsRepository
        .createQueryBuilder('stat')
        .innerJoinAndSelect('stat.match', 'match')
        .where('stat.id_user = :id_user', { id_user })
        .andWhere('stat.rpe IS NOT NULL')
        .andWhere('match.date >= :from', { from })
        .andWhere('match.date <= :to', { to })
        .getMany(),
    ])

    const trainingRecords: TrainingLoadRecord[] = trainingLoads.map((load) => ({
      date: load.session.date,
      rpe: Number(load.rpe),
      duration_min: Number(load.duration_min),
      source: 'training',
    }))

    const matchRecords: TrainingLoadRecord[] = matchStats
      .filter((stat) => stat.rpe !== null && stat.rpe !== undefined)
      .map((stat) => ({
        date: stat.match.date,
        rpe: Number(stat.rpe),
        duration_min: Number(stat.minutes_played),
        source: 'match',
      }))

    return [...trainingRecords, ...matchRecords].sort((a, b) =>
      a.date.localeCompare(b.date),
    )
  }

  async getMatchAppearances(
    id_user: number,
    from: string,
    to: string,
  ): Promise<{ date: string; minutes_played: number }[]> {
    const stats = await this.matchStatisticsRepository
      .createQueryBuilder('stat')
      .innerJoinAndSelect('stat.match', 'match')
      .where('stat.id_user = :id_user', { id_user })
      .andWhere('match.date >= :from', { from })
      .andWhere('match.date <= :to', { to })
      .getMany()
    return stats.map((stat) => ({
      date: stat.match.date,
      minutes_played: Number(stat.minutes_played),
    }))
  }
}
