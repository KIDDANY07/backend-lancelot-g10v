import { ApiProperty } from '@nestjs/swagger'
import { Expose, Transform } from 'class-transformer'
import { EvaluationDimension } from '../evaluation-catalog'

export class ResponseTechnicalEvaluationDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id_eval_tech: number

  @Expose()
  @ApiProperty({ example: 7 })
  id_user: number

  @Expose()
  @Transform(({ obj }) =>
    `${obj.athlete?.name ?? ''} ${obj.athlete?.lastname ?? ''}`.trim(),
  )
  @ApiProperty({ example: 'Juan Pérez' })
  athlete_name: string

  @Expose()
  @ApiProperty({ example: 1 })
  id_season: number

  @Expose()
  @Transform(({ obj }) => obj.season?.name)
  @ApiProperty({ example: '2026-A' })
  season_name: string

  @Expose()
  @ApiProperty({ enum: EvaluationDimension })
  dimension: EvaluationDimension

  @Expose()
  @ApiProperty({ example: 'Pase corto' })
  indicator: string

  @Expose()
  @ApiProperty({ example: 8.5, minimum: 1, maximum: 10 })
  score: number

  @Expose()
  @ApiProperty({ example: 2 })
  evaluator_id: number

  @Expose()
  @Transform(({ obj }) =>
    `${obj.evaluator?.name ?? ''} ${obj.evaluator?.lastname ?? ''}`.trim(),
  )
  @ApiProperty({ example: 'María Gómez' })
  evaluator_name: string

  @Expose()
  @ApiProperty({ example: '2026-01-22', format: 'date' })
  eval_date: string

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  created_at: Date

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: Date
}
