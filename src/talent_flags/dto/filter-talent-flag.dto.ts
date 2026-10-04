import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator'
import {
  TalentFlagSource,
  TalentFlagStatus,
} from '../entities/talent-flag.entity'

export class FilterTalentFlagDto {
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
  @IsEnum(TalentFlagStatus)
  @ApiPropertyOptional({ enum: TalentFlagStatus })
  status?: TalentFlagStatus

  @IsOptional()
  @IsEnum(TalentFlagSource)
  @ApiPropertyOptional({
    enum: TalentFlagSource,
    description:
      'Origen de la señalización: manual, reglas automáticas o modelo de ML',
  })
  source?: TalentFlagSource
}
