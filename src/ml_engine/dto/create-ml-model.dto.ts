import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'

export class MlModelMetricsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiPropertyOptional({ example: 0.71, nullable: true })
  roc_auc?: number | null

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiPropertyOptional({
    example: 0.24,
    nullable: true,
    description: 'Área bajo la curva precisión-recall (métrica principal)',
  })
  pr_auc?: number | null

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiPropertyOptional({ example: 0.6, nullable: true })
  recall?: number | null

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiPropertyOptional({ example: 0.18, nullable: true })
  precision?: number | null

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiPropertyOptional({ example: 0.05, nullable: true })
  brier?: number | null

  @IsOptional()
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({ example: 4200, nullable: true })
  n_train?: number | null

  @IsOptional()
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({ example: 1050, nullable: true })
  n_test?: number | null

  @IsOptional()
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({ example: 9, nullable: true })
  positives_test?: number | null
}

export class CreateMlModelDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  @ApiProperty({ example: 'hgb-20261001-1530', description: 'Versión única' })
  version: string

  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  @ApiProperty({ example: 'HistGradientBoostingClassifier' })
  algorithm: string

  @IsString()
  @IsNotEmpty()
  @Length(1, 10)
  @ApiProperty({ example: 'v1', description: 'Versión de las variables' })
  feature_version: string

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @ApiProperty({
    type: [String],
    example: ['acwr', 'acwr_ewma', 'high_rpe_sessions_14d'],
    description: 'Variables del snapshot que usa el modelo, en orden',
  })
  features: string[]

  @ValidateNested()
  @Type(() => MlModelMetricsDto)
  @ApiProperty({
    type: MlModelMetricsDto,
    description: 'Métricas del modelo en el conjunto de prueba temporal',
  })
  metrics: MlModelMetricsDto

  @IsOptional()
  @ValidateNested()
  @Type(() => MlModelMetricsDto)
  @ApiPropertyOptional({
    type: MlModelMetricsDto,
    description:
      'Métricas de las reglas de la fase 1 en el mismo conjunto de prueba (línea base)',
  })
  rules_baseline_metrics?: MlModelMetricsDto

  @IsDateString()
  @ApiProperty({ example: '2025-02-01', format: 'date' })
  train_from: string

  @IsDateString()
  @ApiProperty({ example: '2025-11-10', format: 'date' })
  train_to: string

  @IsDateString()
  @ApiProperty({ example: '2025-11-11', format: 'date' })
  test_from: string

  @IsDateString()
  @ApiProperty({ example: '2026-01-31', format: 'date' })
  test_to: string

  @IsBoolean()
  @ApiProperty({
    example: false,
    description:
      'true si se entrenó con datos sintéticos o insuficientes; un modelo sintético nunca puede activarse',
  })
  is_synthetic: boolean

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'Entrenamiento con la temporada 2025' })
  notes?: string
}
