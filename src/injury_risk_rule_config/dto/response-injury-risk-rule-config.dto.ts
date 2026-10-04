import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import type { ConfigScope } from 'src/common/scoped_config/scoped-config'

export class ResponseInjuryRiskRuleConfigDto {
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
  @ApiProperty({ example: 1.5 })
  sustained_acwr_threshold: number

  @Expose()
  @ApiProperty({ example: 2 })
  sustained_acwr_min_days: number

  @Expose()
  @ApiProperty({ example: 7 })
  sustained_acwr_lookback_days: number

  @Expose()
  @ApiProperty({ example: 8 })
  sustained_rpe_threshold: number

  @Expose()
  @ApiProperty({ example: 3 })
  sustained_rpe_min_sessions: number

  @Expose()
  @ApiProperty({ example: 14 })
  sustained_rpe_lookback_days: number

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  created_at: Date

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: Date
}
