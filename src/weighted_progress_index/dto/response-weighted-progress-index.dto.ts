import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose, Transform } from 'class-transformer'

export class ResponseWeightedProgressIndexDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id_index: number

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
  @ApiProperty({ example: 1 })
  id_profile: number

  @Expose()
  @ApiProperty({ example: 87.5 })
  physical_score: number

  @Expose()
  @ApiProperty({ example: 80 })
  technical_score: number

  @Expose()
  @ApiProperty({ example: 65 })
  tactical_score: number

  @Expose()
  @ApiProperty({ example: 70 })
  participation_score: number

  @Expose()
  @ApiPropertyOptional({
    example: 62.5,
    nullable: true,
    description:
      'Percentil de su contribución en partidos frente a su grupo de posición en la categoría (0-100). Jugadores de campo: goles y asistencias por partido completo; arqueros: porcentaje de atajadas y vallas invictas. Forma parte de la participación; null si no tiene minutos o la posición no está en el catálogo',
  })
  contribution_score?: number | null

  @Expose()
  @ApiProperty({ example: 78.5 })
  index_value: number

  @Expose()
  @ApiProperty({ type: [String], required: false })
  warnings?: string[] | null

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  created_at: Date

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: Date
}
