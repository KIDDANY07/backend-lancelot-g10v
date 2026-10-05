export const RoleCode = {
  ADMIN: 'ADMIN',
  ENTRENADOR: 'ENTRENADOR',
  DEPORTISTA: 'DEPORTISTA',
  DIRECTOR_TECNICO: 'DIRECTOR_TECNICO',
  ENCARGADO_SALUD: 'ENCARGADO_SALUD',
} as const

export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode]

export const ROLE_IDS: Record<RoleCode, number> = {
  ADMIN: 1,
  ENTRENADOR: 2,
  DEPORTISTA: 3,
  DIRECTOR_TECNICO: 4,
  ENCARGADO_SALUD: 5,
}
