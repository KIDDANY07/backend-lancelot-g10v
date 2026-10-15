import { BadRequestException, ConflictException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { Repository } from 'typeorm'
import { Role } from 'src/roles/entities/role.entity'
import { User } from './entities/user.entity'
import { UsersService } from './users.service'
import { DATA_POLICY_VERSION } from 'src/common/utils/data-policy.util'

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}))

const ROLES = [
  { id_role: 1, name: 'ADMIN', code: 'ADMIN' },
  { id_role: 2, name: 'ENTRENADOR', code: 'ENTRENADOR' },
  { id_role: 3, name: 'DEPORTISTA', code: 'DEPORTISTA' },
]

function buildService(existing: Partial<User> | null = null, admins = 2) {
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
    delete: jest.fn(() => Promise.resolve({ affected: 1 })),
    count: jest.fn(() => Promise.resolve(admins)),
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

  describe('data policy', () => {
    it('stores the acceptance date and version when the athlete registers', async () => {
      const { service, usersRepository } = buildService()
      const result = await service.create(
        {
          name: 'Ana',
          lastname: 'Pérez',
          email: 'ana@club.co',
          password: 'secreta1',
          birth_date: '2010-04-12',
        },
        true,
      )

      const [saved] = usersRepository.save.mock.calls[0]
      expect(saved.data_policy_version).toBe(DATA_POLICY_VERSION)
      expect(saved.data_policy_accepted_at).toBeInstanceOf(Date)
      expect(result.user.data_policy_pending).toBe(false)
    })

    it('marks the policy as pending for accounts created without it', async () => {
      const { service, usersRepository } = buildService()
      const result = await service.create({
        name: 'Ana',
        lastname: 'Pérez',
        email: 'ana@club.co',
        password: 'secreta1',
        birth_date: '2010-04-12',
      })

      const [saved] = usersRepository.save.mock.calls[0]
      expect(saved.data_policy_accepted_at).toBeUndefined()
      expect(result.user.data_policy_pending).toBe(true)
    })

    it('records the acceptance of a user that was pending', async () => {
      const { service, usersRepository } = buildService({
        id_user: 5,
        email: 'a@b.co',
      })
      await service.acceptDataPolicy(5, true)

      const [, changes] = usersRepository.update.mock.calls[0] as [
        number,
        Partial<User>,
      ]
      expect(changes.data_policy_version).toBe(DATA_POLICY_VERSION)
      expect(changes.data_policy_accepted_at).toBeInstanceOf(Date)
    })

    it('rejects a request that does not accept the policy', async () => {
      const { service, usersRepository } = buildService({ id_user: 5 })

      await expect(service.acceptDataPolicy(5, false)).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(usersRepository.update).not.toHaveBeenCalled()
    })
  })

  describe('delete', () => {
    it('deletes the account and lets the database clean up its related data', async () => {
      const { service, usersRepository } = buildService({
        id_user: 8,
        id_role: 3,
      })
      await service.delete(8, 1)

      expect(usersRepository.delete).toHaveBeenCalledWith(8)
    })

    it('does not let an administrator delete their own account', async () => {
      const { service, usersRepository } = buildService({
        id_user: 1,
        id_role: 1,
      })

      await expect(service.delete(1, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(usersRepository.delete).not.toHaveBeenCalled()
    })

    it('keeps at least one administrator in the club', async () => {
      const { service, usersRepository } = buildService(
        { id_user: 4, id_role: 1 },
        1,
      )

      await expect(service.delete(4, 9)).rejects.toBeInstanceOf(
        ConflictException,
      )
      expect(usersRepository.delete).not.toHaveBeenCalled()
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
