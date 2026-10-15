import { ArgumentsHost } from '@nestjs/common'
import { QueryFailedError } from 'typeorm'
import { DatabaseConflictFilter } from './database-conflict.filter'

function failure(code: string) {
  return new QueryFailedError('DELETE FROM users', [], {
    code,
    message: 'violation',
  } as unknown as Error)
}

function respond(error: QueryFailedError) {
  const json = jest.fn()
  const status = jest.fn(() => ({ json }))
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost
  new DatabaseConflictFilter().catch(error, host)
  return { status, json }
}

describe('DatabaseConflictFilter', () => {
  it('answers a foreign key violation with a 409 instead of a 500', () => {
    const { status, json } = respond(failure('23503'))

    expect(status).toHaveBeenCalledWith(409)
    expect(json).toHaveBeenCalledWith({
      status: 'Error',
      mensaje:
        'No se puede completar la operación porque el registro está relacionado con otra información del sistema.',
    })
  })

  it('answers a duplicated record with a 409', () => {
    const { status } = respond(failure('23505'))

    expect(status).toHaveBeenCalledWith(409)
  })

  it('keeps any other database error as a 500 without leaking details', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { status, json } = respond(failure('42P01'))

    expect(status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith({
      status: 'Error',
      mensaje: 'Ocurrió un error inesperado en la base de datos.',
    })
  })
})
