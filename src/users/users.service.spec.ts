import { BadRequestException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { Repository } from 'typeorm'
import { Role } from 'src/roles/entities/role.entity'
import { User } from './entities/user.entity'
import { UsersService } from './users.service'

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}))

const ROLES = [
  { id_role: 1, name: 'ADMIN', code: 'ADMIN' },
  { id_role: 2, name: 'ENTRENADOR', code: 'ENTRENADOR' },
  { id_role: 3, name: 'DEPORTISTA', code: 'DEPORTISTA' },
]

function buildService(existing: Partial<User> | null = null) {
  const usersRepository = {
    findOne: jest.fn(
      ({ where }: { where: { id_user?: number; email?: string } }) => {
        if (where.email) return Promise.resolve(null)
        return Promise.resolve(
          existing ? { ...existing, role: ROLES[1] } : null,
        )
      },
    ),
    save: jest.fn((data: Partial<User>) =>
      Promise.resolve({ ...data, id_user: 10 }),
    ),
    update: jest.fn(() => Promise.resolve({})),
  }
  const rolesRepository = {
    findOne: jest.fn(({ where }: { where: { id_role: number } }) =>
      Promise.resolve(ROLES.find((r) => r.id_role === where.id_role) ?? null),
    ),
  }
  const service = new UsersService(
    usersRepository as unknown as Repository<User>,
    rolesRepository as unknown as Repository<Role>,
  )
  return { service, usersRepository }
}

const STAFF = {
  name: 'Carlos',
  lastname: 'Rojas',
  email: 'carlos.rojas@verafc.co',
  password: 'Temporal123',
  id_role: 2,
}

describe('UsersService', () => {
  describe('createByAdmin', () => {
    it('creates a staff user with the given role and a hashed password', async () => {
      const { service, usersRepository } = buildService({ id_user: 10 })
      await service.createByAdmin(STAFF)

      const saved: Partial<User> = usersRepository.save.mock.calls[0][0]
      expect(saved.id_role).toBe(2)
      expect(saved.birth_date).toBeNull()
      expect(saved.password).not.toBe('Temporal123')
      await expect(
        bcrypt.compare('Temporal123', saved.password as string),
      ).resolves.toBe(true)
    })

    it('rejects an unknown role', async () => {
      const { service } = buildService()
      await expect(
        service.createByAdmin({ ...STAFF, id_role: 99 }),
      ).rejects.toThrow(BadRequestException)
    })

    it('requires the birth date for athletes', async () => {
      const { service } = buildService()
      await expect(
        service.createByAdmin({ ...STAFF, id_role: 3 }),
      ).rejects.toMatchObject({
        response: {
          mensaje: 'La fecha de nacimiento es obligatoria para los deportistas',
        },
      })
    })
  })

  describe('update', () => {
    it('hashes the password instead of storing it in plain text', async () => {
      const { service, usersRepository } = buildService({
        id_user: 5,
        email: 'a@b.co',
      })
      await service.update(5, { password: 'Nueva12345' })

      const [, changes] = usersRepository.update.mock.calls[0] as [
        number,
        Partial<User>,
      ]
      expect(changes.password).not.toBe('Nueva12345')
      await expect(
        bcrypt.compare('Nueva12345', changes.password as string),
      ).resolves.toBe(true)
    })

    it('rejects a role that does not exist', async () => {
      const { service, usersRepository } = buildService({
        id_user: 5,
        email: 'a@b.co',
      })
      await expect(service.update(5, { id_role: 99 })).rejects.toThrow(
        BadRequestException,
      )
      expect(usersRepository.update).not.toHaveBeenCalled()
    })
  })

  describe('updateProfile', () => {
    it('never changes the role or the password, even if they are sent', async () => {
      const { service, usersRepository } = buildService({
        id_user: 5,
        email: 'a@b.co',
      })
      await service.updateProfile(5, {
        name: 'Juan',
        id_role: 1,
        password: 'hack',
      } as never)

      const [, changes] = usersRepository.update.mock.calls[0] as [
        number,
        Partial<User>,
      ]
      expect(changes.name).toBe('Juan')
      expect(changes.id_role).toBeUndefined()
      expect(changes.password).toBeUndefined()
    })
  })

  describe('changePassword', () => {
    it('rejects a wrong current password', async () => {
      const { service, usersRepository } = buildService({
        id_user: 5,
        password: await bcrypt.hash('Correcta123', 4),
      })
      await expect(
        service.changePassword(5, {
          current_password: 'Otra123',
          new_password: 'Nueva123',
        }),
      ).rejects.toMatchObject({
        response: { mensaje: 'La contraseña actual no es correcta' },
      })
      expect(usersRepository.update).not.toHaveBeenCalled()
    })

    it('stores the new password hashed when the current one matches', async () => {
      const { service, usersRepository } = buildService({
        id_user: 5,
        password: await bcrypt.hash('Correcta123', 4),
      })
      await service.changePassword(5, {
        current_password: 'Correcta123',
        new_password: 'Nueva12345',
      })
      const [, changes] = usersRepository.update.mock.calls[0] as [
        number,
        Partial<User>,
      ]
      await expect(
        bcrypt.compare('Nueva12345', changes.password as string),
      ).resolves.toBe(true)
    })
  })
})
