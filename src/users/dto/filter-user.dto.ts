import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { RoleCode } from 'src/roles/role-codes'

export class FilterUserDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    description: 'Página a consultar.',
    example: 1,
    minimum: 1,
    default: 1,
  })
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    description: 'Registros por página.',
    example: 10,
    minimum: 1,
    default: 10,
  })
  limit?: number = 10

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description:
      'Busca cada palabra en el nombre, el apellido o el correo, sin distinguir tildes ni mayúsculas.',
    example: 'juan perez',
  })
  search?: string

  @IsOptional()
  @IsIn(Object.values(RoleCode))
  @ApiPropertyOptional({
    description: 'Código del rol.',
    enum: Object.values(RoleCode),
  })
  role?: RoleCode

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    description:
      'Temporada contra la que se evalúan id_category y unassigned. Sin ella, esos filtros se ignoran.',
    example: 3,
  })
  id_season?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    description: 'Solo deportistas asignados a esta categoría en la temporada.',
    example: 2,
  })
  id_category?: number

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @ApiPropertyOptional({
    description: 'Solo deportistas sin categoría en la temporada.',
    example: true,
  })
  unassigned?: boolean

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'Texto a buscar en los nombres.',
    example: 'Juan',
  })
  name?: string

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'Texto a buscar en los apellidos.',
    example: 'Pérez',
  })
  lastname?: string

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'Texto a buscar en el correo.',
    example: 'juan@example.com',
  })
  email?: string
}
