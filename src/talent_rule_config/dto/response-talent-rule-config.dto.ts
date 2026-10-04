import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import type { ConfigScope } from 'src/common/scoped_config/scoped-config'

export class ResponseTalentRuleConfigDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id_config: number

  @Expose()
  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description: 'Categoría de la anulación; null en la configuración global',
  })
  id_category?: number | null

  @Expose()
  @ApiProperty({
    enum: ['category', 'global'],
    example: 'global',
    description:
      'Origen de la configuración: anulación de la categoría o configuración global',
  })
  scope: ConfigScope

  @Expose()
  @ApiProperty({ example: 80 })
  min_percentile: number

  @Expose()
  @ApiProperty({ example: 40 })
  min_dimension_score: number

  @Expose()
  @ApiProperty({ example: 5 })
  min_improvement_delta: number

  @Expose()
  @ApiProperty({ example: 50 })
  min_participation_score: number

  @Expose()
  @ApiProperty({ example: true })
  exclude_severe_injury: boolean

  @Expose()
  @ApiProperty({ example: 1 })
  min_supporting_criteria: number

  @Expose()
  @ApiProperty({ example: 12 })
  near_max_age_months: number

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  created_at: Date

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: Date
}
