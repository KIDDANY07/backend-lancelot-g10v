import { Repository } from 'typeorm'
import { MatchStatistic } from 'src/match_statistics/entities/match-statistic.entity'
import { TrainingLoad } from 'src/training_loads/entities/training-load.entity'
import { AcwrCalculatorService } from './acwr-calculator.service'
import { LoadRecordsService } from './load-records.service'

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}))

interface QueryBuilderMock {
  innerJoinAndSelect: jest.Mock
  where: jest.Mock
  andWhere: jest.Mock
  getMany: jest.Mock
}

function queryBuilderReturning(rows: unknown[]): QueryBuilderMock {
  const qb = {} as QueryBuilderMock
  qb.innerJoinAndSelect = jest.fn().mockReturnValue(qb)
  qb.where = jest.fn().mockReturnValue(qb)
  qb.andWhere = jest.fn().mockReturnValue(qb)
  qb.getMany = jest.fn().mockResolvedValue(rows)
  return qb
}

function buildService(trainingRows: unknown[], matchRows: unknown[]) {
  const trainingQb = queryBuilderReturning(trainingRows)
  const matchQb = queryBuilderReturning(matchRows)
  const trainingLoadsRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(trainingQb),
  } as unknown as Repository<TrainingLoad>
  const matchStatisticsRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(matchQb),
  } as unknown as Repository<MatchStatistic>
  const service = new LoadRecordsService(
    trainingLoadsRepository,
    matchStatisticsRepository,
  )
  return { service, trainingQb, matchQb }
}

describe('LoadRecordsService', () => {
  it('maps training loads with source = training', async () => {
    const { service } = buildService(
      [{ rpe: 5, duration_min: 60, session: { date: '2026-03-01' } }],
      [],
    )
    const records = await service.getRecords(7, '2026-02-01', '2026-03-28')
    expect(records).toEqual([
      { date: '2026-03-01', rpe: 5, duration_min: 60, source: 'training' },
    ])
  })

  it('adds a match with RPE as load (rpe x minutes_played)', async () => {
    const { service } = buildService(
      [{ rpe: 5, duration_min: 60, session: { date: '2026-03-01' } }],
      [{ rpe: 8, minutes_played: 90, match: { date: '2026-03-02' } }],
    )
    const records = await service.getRecords(7, '2026-02-01', '2026-03-28')

    expect(records).toHaveLength(2)
    expect(records[1]).toEqual({
      date: '2026-03-02',
      rpe: 8,
      duration_min: 90,
      source: 'match',
    })
    const dailyLoad = new AcwrCalculatorService().buildDailyLoadMap(records)
    expect(dailyLoad.get('2026-03-02')).toBe(720)
  })

  it('ignores a match without RPE', async () => {
    const { service, matchQb } = buildService(
      [],
      [
        { rpe: null, minutes_played: 90, match: { date: '2026-03-02' } },
        { rpe: 6, minutes_played: 45, match: { date: '2026-03-05' } },
      ],
    )
    const records = await service.getRecords(7, '2026-02-01', '2026-03-28')

    expect(records).toEqual([
      { date: '2026-03-05', rpe: 6, duration_min: 45, source: 'match' },
    ])
    expect(matchQb.andWhere).toHaveBeenCalledWith('stat.rpe IS NOT NULL')
  })

  it('sorts training and match records by date', async () => {
    const { service } = buildService(
      [
        { rpe: 4, duration_min: 30, session: { date: '2026-03-03' } },
        { rpe: 5, duration_min: 60, session: { date: '2026-03-01' } },
      ],
      [{ rpe: 7, minutes_played: 70, match: { date: '2026-03-02' } }],
    )
    const records = await service.getRecords(7, '2026-02-01', '2026-03-28')
    expect(records.map((r) => r.date)).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
    ])
  })

  it('filters both sources by user and date range', async () => {
    const { service, trainingQb, matchQb } = buildService([], [])
    await service.getRecords(7, '2026-02-01', '2026-03-28')

    expect(trainingQb.where).toHaveBeenCalledWith('load.id_user = :id_user', {
      id_user: 7,
    })
    expect(trainingQb.andWhere).toHaveBeenCalledWith('session.date >= :from', {
      from: '2026-02-01',
    })
    expect(trainingQb.andWhere).toHaveBeenCalledWith('session.date <= :to', {
      to: '2026-03-28',
    })
    expect(matchQb.where).toHaveBeenCalledWith('stat.id_user = :id_user', {
      id_user: 7,
    })
    expect(matchQb.andWhere).toHaveBeenCalledWith('match.date >= :from', {
      from: '2026-02-01',
    })
    expect(matchQb.andWhere).toHaveBeenCalledWith('match.date <= :to', {
      to: '2026-03-28',
    })
  })

  describe('getMatchAppearances', () => {
    it('returns the minutes of every match, with or without RPE', async () => {
      const { service, matchQb } = buildService(
        [],
        [
          { rpe: null, minutes_played: 90, match: { date: '2026-03-02' } },
          { rpe: 6, minutes_played: 45, match: { date: '2026-03-05' } },
        ],
      )
      const appearances = await service.getMatchAppearances(
        7,
        '2026-03-01',
        '2026-03-28',
      )

      expect(appearances).toEqual([
        { date: '2026-03-02', minutes_played: 90 },
        { date: '2026-03-05', minutes_played: 45 },
      ])
      expect(matchQb.andWhere).not.toHaveBeenCalledWith('stat.rpe IS NOT NULL')
    })
  })
})
