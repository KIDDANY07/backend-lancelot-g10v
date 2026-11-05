import { cronsEnabled } from './cron.util'

describe('cronsEnabled', () => {
  const original = process.env.CRONS_ENABLED

  afterEach(() => {
    if (original === undefined) delete process.env.CRONS_ENABLED
    else process.env.CRONS_ENABLED = original
  })

  it('keeps the crons enabled by default', () => {
    delete process.env.CRONS_ENABLED
    expect(cronsEnabled()).toBe(true)
  })

  it('disables the crons when CRONS_ENABLED is false', () => {
    process.env.CRONS_ENABLED = ' False '
    expect(cronsEnabled()).toBe(false)
  })
})
