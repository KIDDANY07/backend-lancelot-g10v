import {
  checkCategoryEligibility,
  pickBaseAssignments,
  referenceYearOf,
  sportingAge,
} from './sport-age.util'

const SUB13 = { name: 'Sub-13', max_age: 13 }
const SUB15 = { name: 'Sub-15', max_age: 15 }
const SUB20 = { name: 'Sub-20', max_age: '20' }

describe('sport-age.util', () => {
  it('calcula la edad deportiva con el año de nacimiento', () => {
    expect(sportingAge('2012-11-30', 2026)).toBe(14)
    expect(sportingAge(null, 2026)).toBeNull()
    expect(referenceYearOf('2026-02-01')).toBe(2026)
  })

  it('permite su categoría y las superiores, pero no las menores', () => {
    expect(checkCategoryEligibility('2012-05-10', SUB15, 2026).eligible).toBe(
      true,
    )
    expect(checkCategoryEligibility('2012-05-10', SUB20, 2026).eligible).toBe(
      true,
    )
    const younger = checkCategoryEligibility('2012-05-10', SUB13, 2026)
    expect(younger.eligible).toBe(false)
    expect(younger.reason).toContain('supera el límite de Sub-13')
  })

  it('exige la fecha de nacimiento para validar', () => {
    expect(checkCategoryEligibility(null, SUB15, 2026)).toMatchObject({
      eligible: false,
      sportingAge: null,
    })
  })

  it('elige como base la categoría de menor edad máxima', () => {
    const maxAge = new Map([
      [1, 20],
      [2, 15],
      [3, 17],
    ])
    const base = pickBaseAssignments(
      [
        { id_user: 7, id_category: 1, id_ath_cat: 10 },
        { id_user: 7, id_category: 2, id_ath_cat: 11 },
        { id_user: 8, id_category: 3, id_ath_cat: 12 },
      ],
      (assignment) => maxAge.get(assignment.id_category) ?? Infinity,
    )
    expect(base.get(7)?.id_category).toBe(2)
    expect(base.get(8)?.id_category).toBe(3)
  })
})
