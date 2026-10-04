import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose, Transform } from 'class-transformer'
import {
  InjuryMechanism,
  InjurySeverity,
  InjuryStatus,
} from '../entities/injury.entity'

export class ResponseInjuryDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id_injury: number

  @Expose()
  @ApiProperty({ example: 7 })
  id_user: number

  @Expose()
  @Transform(({ obj }) =>
    `${obj.athlete?.name ?? ''} ${obj.athlete?.lastname ?? ''}`.trim(),
  )
  @ApiProperty({ example: 'Juan Pérez' })
  athlete_name: string

  @Expose()
  @ApiProperty({ example: '2026-03-02', format: 'date' })
  injury_date: string

  @Expose()
  @ApiProperty({ example: 'tobillo' })
  body_part: string

  @Expose()
  @ApiProperty({ enum: InjurySeverity })
  severity: InjurySeverity

  @Expose()
  @ApiPropertyOptional({ example: 'Esguince grado I', nullable: true })
  diagnosis?: string | null

  @Expose()
  @ApiPropertyOptional({
    example: '2026-03-16',
    format: 'date',
    nullable: true,
  })
  recovery_date?: string | null

  @Expose()
  @ApiProperty({ enum: InjuryStatus })
  status: InjuryStatus

  @Expose()
  @ApiPropertyOptional({ enum: InjuryMechanism, nullable: true })
  mechanism?: InjuryMechanism | null

  @Expose()
  @ApiPropertyOptional({ example: 14, nullable: true })
  time_loss_days?: number | null

  @Expose()
  @ApiProperty({ example: 2 })
  registered_by: number

  @Expose()
  @Transform(({ obj }) =>
    `${obj.registeredByUser?.name ?? ''} ${obj.registeredByUser?.lastname ?? ''}`.trim(),
  )
  @ApiProperty({ example: 'María Gómez' })
  registered_by_name: string

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  created_at: Date

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: Date
}
