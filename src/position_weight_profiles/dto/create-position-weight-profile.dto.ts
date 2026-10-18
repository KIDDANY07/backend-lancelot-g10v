import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNotEmpty, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator'

export class CreatePositionWeightProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @ApiProperty({ description: 'Posición del deportista.', example: 'delantero' })
  position: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiProperty({
    description: 'Categoría de edad (debe coincidir con Category.name).',
    example: 'Sub-15',
  })
  age_category: string

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiProperty({ description: 'Peso del componente físico (0-1).', example: 0.4 })
  w_physical: number

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiProperty({ description: 'Peso del componente técnico (0-1).', example: 0.25 })
  w_technical: number

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiProperty({ description: 'Peso del componente táctico (0-1).', example: 0.15 })
  w_tactical: number

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiProperty({
    description: 'Peso del componente de participación (0-1).',
    example: 0.2,
  })
  w_participation: number
}
