import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash, timingSafeEqual } from 'crypto'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'

export const ML_SERVICE_ROLE = 'ML_SERVICE'

const ML_SERVICE_PRINCIPAL = { role: { name: ML_SERVICE_ROLE } }

interface RequestWithUser {
  headers: Record<string, string | string[] | undefined>
  user?: unknown
}

export function isValidMlApiKey(
  provided: string | string[] | undefined,
  expected: string | undefined,
): boolean {
  if (!expected || typeof provided !== 'string' || !provided) return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(provided), digest(expected))
}

function authenticateMlService(
  context: ExecutionContext,
  configService: ConfigService,
): boolean {
  const request = context.switchToHttp().getRequest<RequestWithUser>()
  if (
    !isValidMlApiKey(
      request.headers['x-api-key'],
      configService.get<string>('ML_SERVICE_API_KEY'),
    )
  )
    return false
  request.user = ML_SERVICE_PRINCIPAL
  return true
}

@Injectable()
export class MlServiceApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (authenticateMlService(context, this.configService)) return true
    throw new UnauthorizedException({
      status: 'Error',
      mensaje: 'Clave del servicio de ML inválida o no configurada',
    })
  }
}

@Injectable()
export class MlServiceOrJwtGuard extends JwtAuthGuard {
  constructor(private readonly configService: ConfigService) {
    super()
  }

  canActivate(context: ExecutionContext) {
    if (authenticateMlService(context, this.configService)) return true
    return super.canActivate(context)
  }
}
