import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Min } from 'class-validator'

export class SeasonPlanQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    description:
      'Temporada del siguiente ciclo. Si se omite se usa la temporada que empieza después de la de origen.',
    example: 2,
  })
  id_target_season?: number
}
