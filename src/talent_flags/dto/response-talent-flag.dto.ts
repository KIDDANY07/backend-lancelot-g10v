import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose, Transform } from 'class-transformer'
import {
  TalentFlagSource,
  TalentFlagStatus,
} from '../entities/talent-flag.entity'

export class ResponseTalentFlagDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id_flag: number

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
  @ApiProperty({ example: 1 })
  id_season: number

  @Expose()
  @ApiProperty({
    example: 'Índice de progreso en percentil 90 de su categoría',
  })
  criteria: string

  @Expose()
  @ApiProperty({
    example: 'Evaluar para convocatoria a selección departamental',
  })
  recommended_action: string

  @Expose()
  @ApiProperty({ enum: TalentFlagStatus })
  status: TalentFlagStatus

  @Expose()
  @ApiProperty({ enum: TalentFlagSource, example: TalentFlagSource.RULES })
  source: TalentFlagSource

  @Expose()
  @Transform(({ value }) => (value == null ? null : Number(value)))
  @ApiPropertyOptional({
    example: 92.5,
    nullable: true,
    description: 'Percentil del índice de progreso en su cohorte',
  })
  score?: number | null

  @Expose()
  @ApiPropertyOptional({
    type: [String],
    nullable: true,
    example: ['percentil_alto', 'perfil_multidimensional', 'disponibilidad'],
  })
  triggered_rules?: string[] | null

  @Expose()
  @ApiPropertyOptional({
    type: [String],
    nullable: true,
    example: ['Posible efecto de edad relativa: nacido en el primer trimestre'],
  })
  warnings?: string[] | null

  @Expose()
  @ApiPropertyOptional({
    example: 2,
    nullable: true,
    description:
      'Usuario que registró la señalización; null si la generó el sistema',
  })
  created_by?: number | null

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  created_at: Date

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: Date
}
