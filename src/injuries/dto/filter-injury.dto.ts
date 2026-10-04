import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator'
import {
  InjuryMechanism,
  InjurySeverity,
  InjuryStatus,
} from '../entities/injury.entity'

export class FilterInjuryDto {
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
  @IsEnum(InjurySeverity)
  @ApiPropertyOptional({ enum: InjurySeverity })
  severity?: InjurySeverity

  @IsOptional()
  @IsEnum(InjuryStatus)
  @ApiPropertyOptional({ enum: InjuryStatus })
  status?: InjuryStatus

  @IsOptional()
  @IsEnum(InjuryMechanism)
  @ApiPropertyOptional({
    enum: InjuryMechanism,
    description: 'Filtrar por mecanismo de la lesión',
  })
  mechanism?: InjuryMechanism
}
