export enum PositionSport {
  FUTBOL = 'futbol',
  FUTBOL_SALA = 'futbol_sala',
}

export enum ContributionGroup {
  ARQUERO = 'arquero',
  DEFENSA = 'defensa',
  MEDIOCAMPO = 'mediocampo',
  ATAQUE = 'ataque',
  CAMPO = 'campo',
}

export interface PositionInfo {
  sport: PositionSport
  group: ContributionGroup
}

export const MATCH_MINUTES: Record<PositionSport, number> = {
  [PositionSport.FUTBOL]: 90,
  [PositionSport.FUTBOL_SALA]: 40,
}

export const DEFAULT_MATCH_MINUTES = MATCH_MINUTES[PositionSport.FUTBOL]

const POSITION_CATALOG: Record<string, PositionInfo> = {
  Portero: { sport: PositionSport.FUTBOL, group: ContributionGroup.ARQUERO },
  'Defensa central': {
    sport: PositionSport.FUTBOL,
    group: ContributionGroup.DEFENSA,
  },
  Lateral: { sport: PositionSport.FUTBOL, group: ContributionGroup.DEFENSA },
  'Mediocampista defensivo': {
    sport: PositionSport.FUTBOL,
    group: ContributionGroup.MEDIOCAMPO,
  },
  Mediocampista: {
    sport: PositionSport.FUTBOL,
    group: ContributionGroup.MEDIOCAMPO,
  },
  'Mediocampista ofensivo': {
    sport: PositionSport.FUTBOL,
    group: ContributionGroup.ATAQUE,
  },
  Extremo: { sport: PositionSport.FUTBOL, group: ContributionGroup.ATAQUE },
  Delantero: { sport: PositionSport.FUTBOL, group: ContributionGroup.ATAQUE },
  'Portero de fútbol sala': {
    sport: PositionSport.FUTBOL_SALA,
    group: ContributionGroup.ARQUERO,
  },
  Cierre: { sport: PositionSport.FUTBOL_SALA, group: ContributionGroup.CAMPO },
  Ala: { sport: PositionSport.FUTBOL_SALA, group: ContributionGroup.CAMPO },
  Pívot: { sport: PositionSport.FUTBOL_SALA, group: ContributionGroup.CAMPO },
  Universal: {
    sport: PositionSport.FUTBOL_SALA,
    group: ContributionGroup.CAMPO,
  },
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
}

const BY_NORMALIZED_NAME = new Map(
  Object.entries(POSITION_CATALOG).map(([name, info]) => [
    normalize(name),
    info,
  ]),
)

export function positionInfo(
  position: string | null | undefined,
): PositionInfo | null {
  if (!position) return null
  return BY_NORMALIZED_NAME.get(normalize(position)) ?? null
}

export function matchMinutesFor(position: string | null | undefined): number {
  const info = positionInfo(position)
  return info ? MATCH_MINUTES[info.sport] : DEFAULT_MATCH_MINUTES
}

export function comparisonKey(info: PositionInfo): string {
  return `${info.sport}:${info.group}`
}
