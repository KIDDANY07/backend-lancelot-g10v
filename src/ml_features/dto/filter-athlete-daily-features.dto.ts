import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator'
import { FeatureLabelQuality } from '../entities/athlete-daily-features.entity'
import { OptionalFeatureDateRangeDto } from './feature-date-range.dto'

export class FilterAthleteDailyFeaturesDto extends OptionalFeatureDateRangeDto {
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
  @ApiPropertyOptional({ example: 7, description: 'Filtrar por deportista' })
  id_user?: number

  @IsOptional()
  @IsEnum(FeatureLabelQuality)
  @ApiPropertyOptional({
    enum: FeatureLabelQuality,
    description: 'Filtrar por estado de la etiqueta',
  })
  label_quality?: FeatureLabelQuality
}
