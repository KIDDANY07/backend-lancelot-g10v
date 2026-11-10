import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { RolesGuard } from 'src/auth/guard/roles.guard'
import { DashboardController } from './dashboard.controller'

jest.mock('src/auth/guard/jwt-guard', () => ({ JwtAuthGuard: class {} }))
jest.mock('./dashboard.service', () => ({ DashboardService: class {} }))
jest.mock('./dashboard-insights.service', () => ({
  DashboardInsightsService: class {},
}))
jest.mock('./dashboard-summary.service', () => ({
  DashboardSummaryService: class {},
}))

type Handler = keyof DashboardController

const STAFF = ['ADMIN', 'DIRECTOR_TECNICO', 'ENTRENADOR', 'ENCARGADO_SALUD']
const ALL: Handler[] = [
  'overview',
  'load',
  'byCategory',
  'bySeason',
  'injuryRisk',
  'training',
  'matches',
  'summary',
]

function contextFor(handler: Handler, role: string): ExecutionContext {
  const method: unknown = Reflect.get(DashboardController.prototype, handler)
  return {
    getHandler: () => method,
    getClass: () => DashboardController,
    switchToHttp: () => ({
      getRequest: () => ({ user: { id_user: 1, role: { name: role } } }),
    }),
  } as unknown as ExecutionContext
}

describe('DashboardController roles', () => {
  const guard = new RolesGuard(new Reflector())
  const allowed = (handler: Handler, role: string) => {
    try {
      return guard.canActivate(contextFor(handler, role))
    } catch (error) {
      if (error instanceof ForbiddenException) return false
      throw error
    }
  }

  it('lets the whole staff see the shared sections', () => {
    for (const role of STAFF)
      for (const handler of ALL) expect(allowed(handler, role)).toBe(true)
  })

  it('lets the athlete see only their own sections', () => {
    for (const handler of [
      'overview',
      'load',
      'training',
      'matches',
      'development',
    ] as Handler[])
      expect(allowed(handler, 'DEPORTISTA')).toBe(true)
    for (const handler of [
      'byCategory',
      'bySeason',
      'injuryRisk',
      'health',
      'ml',
      'summary',
    ] as Handler[])
      expect(allowed(handler, 'DEPORTISTA')).toBe(false)
  })

  it('limits health, development and ML to the roles that already see that data', () => {
    expect(allowed('health', 'DIRECTOR_TECNICO')).toBe(false)
    expect(allowed('health', 'ENTRENADOR')).toBe(true)
    expect(allowed('development', 'ENCARGADO_SALUD')).toBe(false)
    expect(allowed('ml', 'ENTRENADOR')).toBe(false)
    expect(allowed('ml', 'ENCARGADO_SALUD')).toBe(true)
  })
})
