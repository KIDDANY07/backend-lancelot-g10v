import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator'
import { EvaluationDimension } from '../evaluation-catalog'

export class FilterTechnicalEvaluationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  limit?: number = 10

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ example: 7 })
  id_user?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ example: 1 })
  id_season?: number

  @IsOptional()
  @IsEnum(EvaluationDimension, {
    message: 'La dimensión debe ser tecnica o tactica',
  })
  @ApiPropertyOptional({ enum: EvaluationDimension })
  dimension?: EvaluationDimension

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'pase' })
  indicator?: string

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ example: '2026-01-22', format: 'date' })
  eval_date?: string
}
