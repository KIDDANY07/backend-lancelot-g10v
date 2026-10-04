import { createHmac } from 'crypto'
import {
  EXPORT_COLUMNS,
  FeatureExportService,
  PSEUDONYM_LENGTH,
} from './feature-export.service'

const SALT = 'test-salt'

describe('FeatureExportService', () => {
  let service: FeatureExportService

  beforeEach(() => {
    service = new FeatureExportService()
  })

  describe('pseudonymize', () => {
    it('is a truncated HMAC-SHA256 of the id with the salt', () => {
      const expected = createHmac('sha256', SALT)
        .update('7')
        .digest('hex')
        .slice(0, PSEUDONYM_LENGTH)
      expect(service.pseudonymize(7, SALT)).toBe(expected)
      expect(service.pseudonymize(7, SALT)).toHaveLength(PSEUDONYM_LENGTH)
    })

    it('is stable for the same id and different across ids and salts', () => {
      expect(service.pseudonymize(7, SALT)).toBe(service.pseudonymize(7, SALT))
      expect(service.pseudonymize(7, SALT)).not.toBe(
        service.pseudonymize(8, SALT),
      )
      expect(service.pseudonymize(7, SALT)).not.toBe(
        service.pseudonymize(7, 'otra-sal'),
      )
    })
  })

  describe('toCsv', () => {
    const row = {
      id_feature: 1,
      id_user: 7,
      date: '2026-03-28',
      position: 'delantero',
      age_years: '14.52',
      acwr: null,
      is_available: true,
      label_quality: 'pending',
      feature_version: 'v1',
      name: 'Juan',
      email: 'juan@example.com',
      birth_date: '2012-03-28',
    }

    it('writes the header with the export columns in order', () => {
      const [header] = service.toCsv([row], SALT).split('\n')
      expect(header).toBe(EXPORT_COLUMNS.join(','))
    })

    it('never exports id_user or personal data', () => {
      const csv = service.toCsv([row], SALT)
      expect(EXPORT_COLUMNS).not.toContain('id_user')
      expect(csv).not.toContain('Juan')
      expect(csv).not.toContain('juan@example.com')
      expect(csv).not.toContain('2012-03-28')
    })

    it('replaces id_user with the pseudonymous key and keeps the values', () => {
      const [, line] = service.toCsv([row], SALT).split('\n')
      const values = line.split(',')
      const column = (name: string) =>
        values[EXPORT_COLUMNS.indexOf(name as (typeof EXPORT_COLUMNS)[number])]

      expect(column('athlete_key')).toBe(service.pseudonymize(7, SALT))
      expect(column('date')).toBe('2026-03-28')
      expect(column('age_years')).toBe('14.52')
      expect(column('acwr')).toBe('')
      expect(column('is_available')).toBe('true')
    })

    it('quotes values containing commas or quotes', () => {
      const csv = service.toCsv([{ ...row, position: 'volante, "10"' }], SALT)
      expect(csv).toContain('"volante, ""10"""')
    })
  })
})
