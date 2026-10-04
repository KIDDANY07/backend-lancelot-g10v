import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Min } from 'class-validator'

export class CategoryScopeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    example: 3,
    description:
      'Categoría etaria. Si se omite, se opera sobre la configuración global',
  })
  id_category?: number
}
