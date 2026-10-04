import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator'
import {
  InjuryMechanism,
  InjurySeverity,
  InjuryStatus,
} from '../entities/injury.entity'

export class CreateInjuryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ example: 7 })
  id_user: number

  @IsDateString()
  @ApiProperty({ example: '2026-03-02', format: 'date' })
  injury_date: string

  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  @ApiProperty({ example: 'tobillo' })
  body_part: string

  @IsEnum(InjurySeverity)
  @ApiProperty({ enum: InjurySeverity, example: InjurySeverity.LEVE })
  severity: InjurySeverity

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'Esguince grado I' })
  diagnosis?: string

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ example: '2026-03-16', format: 'date' })
  recovery_date?: string

  @IsOptional()
  @IsEnum(InjuryStatus)
  @ApiPropertyOptional({ enum: InjuryStatus, default: InjuryStatus.ACTIVE })
  status?: InjuryStatus

  @IsOptional()
  @IsEnum(InjuryMechanism)
  @ApiPropertyOptional({
    enum: InjuryMechanism,
    example: InjuryMechanism.SIN_CONTACTO,
    description:
      'Mecanismo de la lesión. Necesario para usarla como etiqueta del modelo de riesgo (solo cuentan las lesiones sin contacto)',
  })
  mechanism?: InjuryMechanism

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @ApiPropertyOptional({
    example: 14,
    description:
      'Días de baja. Si no se envía y llega recovery_date, se calcula como la diferencia en días con injury_date',
  })
  time_loss_days?: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ example: 2 })
  registered_by: number
}
