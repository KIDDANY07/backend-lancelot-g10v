import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

export const ML_SERVICE_REQUEST_TIMEOUT_MS = 10_000

export interface MlServiceResponse {
  status: number
  ok: boolean
  body: unknown
}

export class MlServiceUnreachableError extends Error {}

@Injectable()
export class MlServiceClient {
  constructor(private readonly configService: ConfigService) {}

  get baseUrl(): string | null {
    const value = this.configService.get<string>('ML_SERVICE_URL')
    return value ? value.replace(/\/$/, '') : null
  }

  async request(
    method: 'POST' | 'DELETE',
    path: string,
    options: { body?: unknown; timeoutMs?: number } = {},
  ): Promise<MlServiceResponse> {
    const baseUrl = this.baseUrl
    if (!baseUrl)
      throw new MlServiceUnreachableError('ML_SERVICE_URL no está configurada')

    const timeoutMs = options.timeoutMs ?? ML_SERVICE_REQUEST_TIMEOUT_MS
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key':
            this.configService.get<string>('ML_SERVICE_API_KEY') ?? '',
        },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      })
      const body: unknown = await response.json().catch(() => null)
      return { status: response.status, ok: response.ok, body }
    } catch (error) {
      throw new MlServiceUnreachableError(
        error instanceof Error && error.name === 'AbortError'
          ? `no respondió en ${timeoutMs / 1000} s`
          : error instanceof Error
            ? error.message
            : String(error),
      )
    } finally {
      clearTimeout(timer)
    }
  }
}
