import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator'
import { MlEngineMode } from '../entities/ml-engine-config.entity'

export class UpdateMlEngineConfigDto {
  @IsOptional()
  @IsEnum(MlEngineMode)
  @ApiPropertyOptional({
    enum: MlEngineMode,
    example: MlEngineMode.SHADOW,
    description:
      'rules: solo reglas. shadow: el ML guarda predicciones sin generar alertas (requiere un modelo activo). ml: el ML también genera evaluaciones, con las reglas como red de seguridad (requiere modelo activo y readiness)',
  })
  engine?: MlEngineMode

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    example: 270,
    description:
      'Mínimo de días distintos (fechas del calendario, no deportista-día) con snapshots etiquetados. Por defecto 270: aprox. una temporada completa de entrenamientos y partidos',
  })
  min_labeled_days?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    example: 20,
    description:
      'Mínimo de lesiones sin contacto cubiertas por el periodo etiquetado. Por defecto 20: con una plantilla de unos 15 deportistas, un club acumula entre 20 y 30 lesiones sin contacto en dos años, y 20 eventos positivos son el mínimo para estimar el modelo y evaluarlo en una partición temporal',
  })
  min_non_contact_injuries?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    example: 15,
    description:
      'Mínimo de deportistas con snapshots etiquetados. Por defecto 15: el tamaño de la plantilla del club; exigir más impediría entrenar el modelo con todos sus deportistas',
  })
  min_athletes?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1)
  @ApiPropertyOptional({
    example: 0.25,
    description:
      'Probabilidad a partir de la cual el riesgo del ML es medio. Valor inicial de referencia: DEBE calibrarse con los datos del club (p. ej. con la curva precisión-recall del conjunto de prueba)',
  })
  prob_medium_threshold?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1)
  @ApiPropertyOptional({
    example: 0.5,
    description:
      'Probabilidad a partir de la cual el riesgo del ML es alto. Valor inicial de referencia: DEBE calibrarse con los datos del club',
  })
  prob_high_threshold?: number

  @IsOptional()
  @IsEnum(MlEngineMode)
  @ApiPropertyOptional({
    enum: MlEngineMode,
    example: MlEngineMode.SHADOW,
    description:
      'Motor de talento. rules: solo reglas. shadow: el modelo de talento guarda sus probabilidades sin crear señalizaciones (requiere un modelo de talento activo). ml: también crea señalizaciones open de origen ml (requiere modelo activo y readiness de talento)',
  })
  talent_engine?: MlEngineMode

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @ApiPropertyOptional({
    example: 2,
    description:
      'Mínimo de temporadas con etiqueta de ascenso (una para entrenar y otra para probar)',
  })
  talent_min_seasons?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    example: 10,
    description:
      'Mínimo de ascensos o consolidaciones reales en las temporadas etiquetadas',
  })
  talent_min_promotions?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    example: 15,
    description:
      'Mínimo de deportistas con temporadas etiquetadas. Por defecto 15: el tamaño de la plantilla del club',
  })
  talent_min_athletes?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1)
  @ApiPropertyOptional({
    example: 0.5,
    description:
      'Probabilidad de ascenso desde la cual el modelo de talento sugiere una señalización. Debe calibrarse con los datos del club',
  })
  talent_prob_threshold?: number
}
