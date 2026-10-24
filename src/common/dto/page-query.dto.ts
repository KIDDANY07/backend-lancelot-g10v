import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    description: 'Página a consultar. Sin ella se devuelve la lista completa.',
    example: 1,
    minimum: 1,
  })
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({
    description: 'Registros por página.',
    example: 10,
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  limit?: number
}
