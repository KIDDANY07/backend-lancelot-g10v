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
      'Mínimo de días distintos con snapshots etiquetados (aprox. una temporada completa)',
  })
  min_labeled_days?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    example: 30,
    description:
      'Mínimo de lesiones sin contacto cubiertas por el periodo etiquetado',
  })
  min_non_contact_injuries?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    example: 20,
    description: 'Mínimo de deportistas con snapshots etiquetados',
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
}
