import { HttpException } from '@nestjs/common'

export function extractErrorMessage(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse()
    if (typeof response === 'object' && response !== null) {
      const { mensaje } = response as { mensaje?: unknown }
      if (typeof mensaje === 'string') return mensaje
    }
    return error.message
  }
  if (error instanceof Error) return error.message
  return String(error)
}
