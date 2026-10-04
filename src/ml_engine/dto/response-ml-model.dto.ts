import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { MlModelMetricsDto } from './create-ml-model.dto'

export class ResponseMlModelDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id_model: number

  @Expose()
  @ApiProperty({ example: 'hgb-20261001-1530' })
  version: string

  @Expose()
  @ApiProperty({ example: 'HistGradientBoostingClassifier' })
  algorithm: string

  @Expose()
  @ApiProperty({ example: 'v1' })
  feature_version: string

  @Expose()
  @ApiProperty({ type: [String] })
  features: string[]

  @Expose()
  @ApiProperty({ type: MlModelMetricsDto })
  metrics: MlModelMetricsDto

  @Expose()
  @ApiPropertyOptional({ type: MlModelMetricsDto, nullable: true })
  rules_baseline_metrics?: MlModelMetricsDto | null

  @Expose()
  @ApiProperty({ example: '2025-02-01', format: 'date' })
  train_from: string

  @Expose()
  @ApiProperty({ example: '2025-11-10', format: 'date' })
  train_to: string

  @Expose()
  @ApiProperty({ example: '2025-11-11', format: 'date' })
  test_from: string

  @Expose()
  @ApiProperty({ example: '2026-01-31', format: 'date' })
  test_to: string

  @Expose()
  @ApiProperty({ example: false })
  is_synthetic: boolean

  @Expose()
  @ApiProperty({ example: false })
  is_active: boolean

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  notes?: string | null

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  created_at: Date

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: Date
}
