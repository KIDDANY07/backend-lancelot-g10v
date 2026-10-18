import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator'
import { EvaluationDimension } from '../evaluation-catalog'

export class CreateTechnicalEvaluationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ example: 7 })
  id_user: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ example: 1 })
  id_season: number

  @IsEnum(EvaluationDimension, {
    message: 'La dimensión debe ser tecnica o tactica',
  })
  @ApiProperty({
    enum: EvaluationDimension,
    description:
      'tecnica: dominio del balón (control, pase, conducción, remate…); tactica: comprensión del juego (posicionamiento, desmarque, marcaje, toma de decisiones…)',
  })
  dimension: EvaluationDimension

  @IsString()
  @IsNotEmpty()
  @Length(1, 60)
  @ApiProperty({
    example: 'Pase corto',
    description:
      'Indicador del catálogo de su dimensión (GET /technical-evaluations/catalog)',
  })
  indicator: string

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1)
  @Max(10)
  @ApiProperty({ example: 8.5, minimum: 1, maximum: 10 })
  score: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ example: 2 })
  evaluator_id: number

  @IsDateString()
  @ApiProperty({ example: '2026-01-22', format: 'date' })
  eval_date: string
}
