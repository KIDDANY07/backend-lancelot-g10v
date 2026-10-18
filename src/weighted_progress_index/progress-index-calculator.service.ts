import { Injectable } from '@nestjs/common'

export interface ProgressIndexWeights {
  w_physical: number
  w_technical: number
  w_tactical: number
  w_participation: number
}

export interface ProgressIndexScores {
  physical: number
  technical: number
  tactical: number
  participation: number
}

export interface ScoreResult {
  score: number
  warnings: string[]
}

const NEUTRAL_PERCENTILE = 50

@Injectable()
export class ProgressIndexCalculatorService {
  private round2(value: number): number {
    return Math.round(value * 100) / 100
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
  }

  /**
   * Percentile of `value` within `cohortValues` (self-inclusive), 0-100.
   * With 0-1 peers to compare against there is no real distribution, so a
   * neutral score is returned instead of a misleading 0 or 100.
   */
  computePercentile(
    value: number,
    cohortValues: number[],
    higherIsBetter: boolean,
  ): number {
    if (cohortValues.length <= 1) return NEUTRAL_PERCENTILE
    const matchCount = higherIsBetter
      ? cohortValues.filter((v) => v <= value).length
      : cohortValues.filter((v) => v >= value).length
    return this.round2((matchCount / cohortValues.length) * 100)
  }

  computePhysicalScore(input: {
    athleteVo2max: number | null
    cohortVo2max: number[]
    athleteSpeed20m: number | null
    cohortSpeed20m: number[]
  }): ScoreResult {
    const percentiles: number[] = []
    if (input.athleteVo2max !== null)
      percentiles.push(
        this.computePercentile(input.athleteVo2max, input.cohortVo2max, true),
      )
    if (input.athleteSpeed20m !== null)
      percentiles.push(
        this.computePercentile(
          input.athleteSpeed20m,
          input.cohortSpeed20m,
          false,
        ),
      )

    if (percentiles.length === 0)
      return {
        score: 0,
        warnings: ['Sin evaluaciones físicas registradas en la temporada'],
      }

    const score =
      percentiles.reduce((sum, p) => sum + p, 0) / percentiles.length
    return { score: this.round2(score), warnings: [] }
  }

  private computeEvaluationScore(
    scores: number[],
    emptyWarning: string,
  ): ScoreResult {
    if (scores.length === 0) return { score: 0, warnings: [emptyWarning] }
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length
    return { score: this.round2(this.clamp(avg * 10, 0, 100)), warnings: [] }
  }

  computeTechnicalScore(scores: number[]): ScoreResult {
    return this.computeEvaluationScore(
      scores,
      'Sin evaluaciones técnicas registradas en la temporada',
    )
  }

  computeTacticalScore(scores: number[]): ScoreResult {
    return this.computeEvaluationScore(
      scores,
      'Sin evaluaciones tácticas registradas en la temporada',
    )
  }

  computeParticipationScore(
    trainingAttendanceRatio: number | null,
    matchMinutesRatio: number | null,
  ): ScoreResult {
    const ratios = [trainingAttendanceRatio, matchMinutesRatio].filter(
      (r): r is number => r !== null,
    )
    if (ratios.length === 0)
      return {
        score: 0,
        warnings: ['Sin datos de participación (entrenamientos o partidos) en la temporada'],
      }
    const avgRatio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length
    return {
      score: this.round2(this.clamp(avgRatio * 100, 0, 100)),
      warnings: [],
    }
  }

  computeIndex(
    scores: ProgressIndexScores,
    weights: ProgressIndexWeights,
  ): number {
    const value =
      scores.physical * Number(weights.w_physical) +
      scores.technical * Number(weights.w_technical) +
      scores.tactical * Number(weights.w_tactical ?? 0) +
      scores.participation * Number(weights.w_participation)
    return this.round2(this.clamp(value, 0, 100))
  }
}
