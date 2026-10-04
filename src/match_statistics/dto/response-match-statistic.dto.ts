import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose, Transform } from 'class-transformer'

export class ResponseMatchStatisticDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id_match_stat: number

  @Expose()
  @ApiProperty({ example: 1 })
  id_match: number

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
  @ApiProperty({ example: 90 })
  minutes_played: number

  @Expose()
  @ApiProperty({ example: 1 })
  goals: number

  @Expose()
  @ApiProperty({ example: 0 })
  assists: number

  @Expose()
  @ApiProperty({ example: 0 })
  yellow_cards: number

  @Expose()
  @ApiProperty({ example: 0 })
  red_cards: number

  @Expose()
  @ApiPropertyOptional({ example: 7, nullable: true })
  rpe?: number | null

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  created_at: Date

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: Date
}
