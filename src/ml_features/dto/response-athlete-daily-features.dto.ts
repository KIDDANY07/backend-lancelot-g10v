import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose, Transform } from 'class-transformer'
import { InjuryRiskLevel } from 'src/injury_risk_assessments/entities/injury-risk-assessment.entity'
import { FeatureLabelQuality } from '../entities/athlete-daily-features.entity'

const toNumber = ({ value }: { value: unknown }) =>
  value === null || value === undefined ? null : Number(value)

export class ResponseAthleteDailyFeaturesDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id_feature: number

  @Expose()
  @ApiProperty({ example: 7 })
  id_user: number

  @Expose()
  @ApiProperty({ example: '2026-03-28', format: 'date' })
  date: string

  @Expose()
  @ApiPropertyOptional({ example: 1, nullable: true })
  id_season?: number | null

  @Expose()
  @ApiPropertyOptional({ example: 3, nullable: true })
  id_category?: number | null

  @Expose()
  @ApiPropertyOptional({ example: 'delantero', nullable: true })
  position?: string | null

  @Expose()
  @Transform(toNumber)
  @ApiPropertyOptional({ example: 14.52, nullable: true })
  age_years?: number | null

  @Expose()
  @Transform(toNumber)
  @ApiProperty({
    example: 310.5,
    description: 'Carga diaria media de los últimos 7 días (RPE x minutos)',
  })
  acute_load_7d: number

  @Expose()
  @Transform(toNumber)
  @ApiProperty({
    example: 255.2,
    description: 'Carga diaria media de los últimos 28 días',
  })
  chronic_load_28d: number

  @Expose()
  @Transform(toNumber)
  @ApiPropertyOptional({ example: 1.22, nullable: true })
  acwr?: number | null

  @Expose()
  @Transform(toNumber)
  @ApiPropertyOptional({
    example: 1.18,
    nullable: true,
    description: 'ACWR con medias móviles exponenciales (EWMA)',
  })
  acwr_ewma?: number | null

  @Expose()
  @Transform(toNumber)
  @ApiPropertyOptional({ example: 1.6, nullable: true })
  monotony_7d?: number | null

  @Expose()
  @Transform(toNumber)
  @ApiPropertyOptional({ example: 3477.6, nullable: true })
  strain_7d?: number | null

  @Expose()
  @ApiProperty({ example: 5 })
  sessions_7d: number

  @Expose()
  @Transform(toNumber)
  @ApiPropertyOptional({ example: 6.4, nullable: true })
  rpe_avg_7d?: number | null

  @Expose()
  @ApiProperty({ example: 90 })
  match_minutes_7d: number

  @Expose()
  @ApiProperty({ example: 2 })
  high_rpe_sessions_14d: number

  @Expose()
  @ApiProperty({ example: 1 })
  prior_injuries_count: number

  @Expose()
  @ApiProperty({ example: 0 })
  prior_non_contact_injuries_count: number

  @Expose()
  @ApiPropertyOptional({ example: 120, nullable: true })
  days_since_last_injury?: number | null

  @Expose()
  @ApiProperty({ example: false })
  is_recovering: boolean

  @Expose()
  @ApiProperty({ example: true })
  is_available: boolean

  @Expose()
  @ApiPropertyOptional({ enum: InjuryRiskLevel, nullable: true })
  rules_risk_level?: InjuryRiskLevel | null

  @Expose()
  @ApiPropertyOptional({ example: false, nullable: true })
  label_injury_7d?: boolean | null

  @Expose()
  @ApiProperty({ enum: FeatureLabelQuality })
  label_quality: FeatureLabelQuality

  @Expose()
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  labeled_at?: Date | null

  @Expose()
  @ApiProperty({ example: 'v1' })
  feature_version: string

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  created_at: Date

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: Date
}
