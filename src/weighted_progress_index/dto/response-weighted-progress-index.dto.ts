import { ApiProperty } from '@nestjs/swagger'
import { Expose, Transform } from 'class-transformer'

export class ResponseWeightedProgressIndexDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id_index: number

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
  @ApiProperty({ example: 1 })
  id_profile: number

  @Expose()
  @ApiProperty({ example: 87.5 })
  physical_score: number

  @Expose()
  @ApiProperty({ example: 80 })
  technical_score: number

  @Expose()
  @ApiProperty({ example: 65 })
  tactical_score: number

  @Expose()
  @ApiProperty({ example: 70 })
  participation_score: number

  @Expose()
  @ApiProperty({ example: 78.5 })
  index_value: number

  @Expose()
  @ApiProperty({ type: [String], required: false })
  warnings?: string[] | null

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  created_at: Date

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: Date
}
