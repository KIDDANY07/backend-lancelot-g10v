import {
  comparisonKey,
  ContributionGroup,
  matchMinutesFor,
  positionInfo,
  PositionSport,
} from './position-catalog'

describe('position catalog', () => {
  it('groups football positions into attack, midfield and defense', () => {
    expect(positionInfo('Delantero')?.group).toBe(ContributionGroup.ATAQUE)
    expect(positionInfo('Extremo')?.group).toBe(ContributionGroup.ATAQUE)
    expect(positionInfo('Mediocampista ofensivo')?.group).toBe(
      ContributionGroup.ATAQUE,
    )
    expect(positionInfo('Mediocampista defensivo')?.group).toBe(
      ContributionGroup.MEDIOCAMPO,
    )
    expect(positionInfo('Lateral')?.group).toBe(ContributionGroup.DEFENSA)
    expect(positionInfo('Portero')?.group).toBe(ContributionGroup.ARQUERO)
  })

  it('puts every futsal field player in the same group and keeps the goalkeeper apart', () => {
    const keys = ['Cierre', 'Ala', 'Pívot', 'Universal'].map((position) =>
      comparisonKey(positionInfo(position)!),
    )
    expect(new Set(keys).size).toBe(1)
    expect(positionInfo('Portero de fútbol sala')).toEqual({
      sport: PositionSport.FUTBOL_SALA,
      group: ContributionGroup.ARQUERO,
    })
    expect(comparisonKey(positionInfo('Portero de fútbol sala')!)).not.toBe(
      comparisonKey(positionInfo('Portero')!),
    )
  })

  it('ignores case and accents in old free-text positions', () => {
    expect(positionInfo('  delantero ')?.group).toBe(ContributionGroup.ATAQUE)
    expect(positionInfo('pivot')?.sport).toBe(PositionSport.FUTBOL_SALA)
    expect(positionInfo('Líbero')).toBeNull()
    expect(positionInfo(null)).toBeNull()
  })

  it('uses 40-minute matches for futsal positions and 90 otherwise', () => {
    expect(matchMinutesFor('Ala')).toBe(40)
    expect(matchMinutesFor('Delantero')).toBe(90)
    expect(matchMinutesFor('Desconocida')).toBe(90)
  })
})
