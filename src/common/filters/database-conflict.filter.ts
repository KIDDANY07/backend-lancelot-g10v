import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Response } from 'express'
import { QueryFailedError } from 'typeorm'

const CONFLICT_MESSAGES: Record<string, string> = {
  '23503':
    'No se puede completar la operación porque el registro está relacionado con otra información del sistema.',
  '23505': 'Ya existe un registro con esos mismos datos.',
}

export function conflictMessage(error: QueryFailedError): string | undefined {
  const code = (error.driverError as { code?: string } | undefined)?.code
  return code ? CONFLICT_MESSAGES[code] : undefined
}

@Catch(QueryFailedError)
export class DatabaseConflictFilter implements ExceptionFilter {
  private readonly logger = new Logger(DatabaseConflictFilter.name)

  catch(error: QueryFailedError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>()
    const mensaje = conflictMessage(error)
    if (mensaje) {
      response.status(HttpStatus.CONFLICT).json({ status: 'Error', mensaje })
      return
    }
    this.logger.error(error.message, error.stack)
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'Error',
      mensaje: 'Ocurrió un error inesperado en la base de datos.',
    })
  }
}
