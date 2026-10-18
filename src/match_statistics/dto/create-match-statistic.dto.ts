import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

export class CreateMatchStatisticDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ example: 1 })
  id_match: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ example: 7 })
  id_user: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @ApiProperty({ example: 90 })
  minutes_played: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({ example: 1, default: 0 })
  goals?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({ example: 0, default: 0 })
  assists?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({ example: 0, default: 0 })
  yellow_cards?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({ example: 0, default: 0 })
  red_cards?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({
    example: 4,
    nullable: true,
    description:
      'Solo arqueros: tiros al arco que atajó. Junto con los goles recibidos da su porcentaje de atajadas',
  })
  saves?: number | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({
    example: 1,
    nullable: true,
    description:
      'Solo arqueros: goles que recibió mientras estuvo en la cancha. Con 0 y al menos medio partido jugado cuenta como valla invicta',
  })
  goals_conceded?: number | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  @ApiPropertyOptional({
    example: 7,
    minimum: 0,
    maximum: 10,
    description:
      'Esfuerzo percibido del partido (escala 0-10). Si se registra, el partido suma carga (RPE x minutos jugados) al ACWR',
  })
  rpe?: number
}
