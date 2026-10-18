import { TalentLabelQuality } from './entities/athlete-season-features.entity'
import {
  TalentDatasetInput,
  TalentFeatureCalculatorService,
  TalentIndexInput,
} from './talent-feature-calculator.service'

const SUB13 = { id_category: 1, min_age: 11, max_age: 13 }
const SUB15 = { id_category: 2, min_age: 14, max_age: 15 }
const SUB17 = { id_category: 3, min_age: 16, max_age: 17 }

const S2025 = { id_season: 1, start_date: '2025-02-01', end_date: '2025-11-30' }
const S2026 = { id_season: 2, start_date: '2026-02-01', end_date: null }

function index(
  id_user: number,
  id_season: number,
  index_value: number,
): TalentIndexInput {
  return {
    id_user,
    id_season,
    index_value,
    physical_score: 60,
    technical_score: 55,
    tactical_score: null,
    participation_score: 70,
    contribution_score: 50,
  }
}

function dataset(
  overrides: Partial<TalentDatasetInput> = {},
): TalentDatasetInput {
  return {
    seasons: [S2026, S2025],
    categories: [SUB13, SUB15, SUB17],
    assignments: [
      {
        id_user: 1,
        id_season: 1,
        id_category: 1,
        position: 'Delantero',
        birth_date: '2012-02-10',
      },
      {
        id_user: 2,
        id_season: 1,
        id_category: 1,
        position: 'Lateral',
        birth_date: '2012-11-20',
      },
      {
        id_user: 3,
        id_season: 1,
        id_category: 1,
        position: 'Portero',
        birth_date: '2012-06-01',
      },
      {
        id_user: 1,
        id_season: 2,
        id_category: 3,
        position: 'Delantero',
        birth_date: '2012-02-10',
      },
      {
        id_user: 2,
        id_season: 2,
        id_category: 2,
        position: 'Lateral',
        birth_date: '2012-11-20',
      },
    ],
    indices: [
      index(1, 1, 80),
      index(2, 1, 60),
      index(3, 1, 50),
      index(1, 2, 85),
    ],
    injuries: [
      { id_user: 2, injury_date: '2025-05-01', severe: true },
      { id_user: 2, injury_date: '2024-05-01', severe: false },
    ],
    rulesFlagged: [{ id_user: 1, id_season: 1 }],
    today: '2026-10-18',
    ...overrides,
  }
}

describe('TalentFeatureCalculatorService', () => {
  const service = new TalentFeatureCalculatorService()

  it('labels as promoted who plays above the category of his age next season', () => {
    const rows = service.buildRows(dataset())
    const byUser = (id_user: number, id_season: number) =>
      rows.find((row) => row.id_user === id_user && row.id_season === id_season)

    expect(byUser(1, 1)).toMatchObject({
      label_quality: TalentLabelQuality.LABELED,
      label_promoted: true,
      rules_flagged: true,
      age_years: 13,
      birth_quarter: 1,
      years_to_category_max: 0,
      cohort_size: 3,
      index_percentile: 100,
    })
    expect(byUser(2, 1)).toMatchObject({
      label_quality: TalentLabelQuality.LABELED,
      label_promoted: false,
      injuries_in_season: 1,
      severe_injury: true,
      birth_quarter: 4,
    })
  })

  it('excludes who left the club and keeps the last season pending', () => {
    const rows = service.buildRows(dataset())
    expect(rows.find((row) => row.id_user === 3)?.label_quality).toBe(
      TalentLabelQuality.EXCLUDED,
    )
    expect(
      rows.find((row) => row.id_user === 1 && row.id_season === 2),
    ).toMatchObject({
      label_quality: TalentLabelQuality.PENDING,
      label_promoted: null,
      plays_up: true,
      index_delta: 5,
      seasons_in_club: 1,
    })
  })

  it('keeps the labels pending while the next season has no squad yet', () => {
    const rows = service.buildRows(
      dataset({
        assignments: dataset().assignments.filter(
          (item) => item.id_season === 1,
        ),
      }),
    )
    expect(
      rows.every((row) => row.label_quality === TalentLabelQuality.PENDING),
    ).toBe(true)
  })

  it('skips athletes without a progress index', () => {
    const rows = service.buildRows(dataset({ indices: [index(1, 1, 80)] }))
    expect(rows.map((row) => row.id_user)).toEqual([1])
    expect(rows[0].index_percentile).toBe(50)
  })
})
