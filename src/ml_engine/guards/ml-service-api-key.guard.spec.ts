import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  ML_SERVICE_ROLE,
  MlServiceApiKeyGuard,
  isValidMlApiKey,
} from './ml-service-api-key.guard'

jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))
jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class {
      canActivate() {
        return false
      }
    },
}))

function contextWith(headers: Record<string, string>) {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers,
  }
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
  return { context, request }
}

function guardWithKey(key: string | undefined) {
  const configService = { get: () => key } as unknown as ConfigService
  return new MlServiceApiKeyGuard(configService)
}

describe('isValidMlApiKey', () => {
  it('accepts only the exact configured key', () => {
    expect(isValidMlApiKey('secret', 'secret')).toBe(true)
    expect(isValidMlApiKey('secreto', 'secret')).toBe(false)
    expect(isValidMlApiKey('', 'secret')).toBe(false)
    expect(isValidMlApiKey(undefined, 'secret')).toBe(false)
    expect(isValidMlApiKey(['secret'], 'secret')).toBe(false)
  })

  it('rejects everything when no key is configured', () => {
    expect(isValidMlApiKey('anything', undefined)).toBe(false)
    expect(isValidMlApiKey('', '')).toBe(false)
  })
})

describe('MlServiceApiKeyGuard', () => {
  it('lets the ML service in and identifies it with the ML_SERVICE role', () => {
    const { context, request } = contextWith({ 'x-api-key': 'secret' })
    expect(guardWithKey('secret').canActivate(context)).toBe(true)
    expect(request.user).toEqual({ role: { name: ML_SERVICE_ROLE } })
  })

  it('rejects a wrong or missing key', () => {
    expect(() =>
      guardWithKey('secret').canActivate(
        contextWith({ 'x-api-key': 'otra' }).context,
      ),
    ).toThrow(UnauthorizedException)
    expect(() =>
      guardWithKey('secret').canActivate(contextWith({}).context),
    ).toThrow(UnauthorizedException)
  })
})
