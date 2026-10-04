import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import type { ConfigScope } from 'src/common/scoped_config/scoped-config'

export class ResponseAcwrThresholdDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id_threshold: number

  @Expose()
  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description: 'Categoría de la anulación; null en la configuración global',
  })
  id_category?: number | null

  @Expose()
  @ApiProperty({
    enum: ['category', 'global'],
    example: 'global',
    description:
      'Origen de los umbrales: anulación de la categoría o configuración global',
  })
  scope: ConfigScope

  @Expose()
  @ApiProperty({ example: 0.8 })
  low_min: number

  @Expose()
  @ApiProperty({ example: 1.3 })
  low_max: number

  @Expose()
  @ApiProperty({ example: 1.5 })
  medium_max: number

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  created_at: Date

  @Expose()
  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: Date
}
