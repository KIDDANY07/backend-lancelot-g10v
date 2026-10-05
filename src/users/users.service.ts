import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ROLE_IDS } from 'src/roles/role-codes'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { InjectRepository } from '@nestjs/typeorm'
import { User } from './entities/user.entity'
import { Repository } from 'typeorm'
import { FilterUserDto } from './dto/filter-user.dto'
import { plainToInstance } from 'class-transformer'
import { ResponseUserDto } from './dto/response-user.dto'
import * as bcrypt from 'bcryptjs'
import { Role } from 'src/roles/entities/role.entity'
import { AdminCreateUserDto } from './dto/admin-create-user.dto'
import { ChangePasswordDto } from './dto/change-password.dto'
import { UpdateMyProfileDto } from './dto/update-my-profile.dto'

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private usersRepository: Repository<User>,
    @InjectRepository(Role) private rolesRepository: Repository<Role>,
  ) {}

  async findOneById(id_user: number) {
    const user = await this.usersRepository.findOne({
      where: { id_user },
      relations: { role: true, athletesInCategory: true },
    })
    return user
  }

  async findAllAthleteIds(): Promise<number[]> {
    const athletes = await this.usersRepository
      .createQueryBuilder('user')
      .innerJoin('user.role', 'role')
      .where('role.code = :code', { code: 'DEPORTISTA' })
      .select('user.id_user')
      .getMany()
    return athletes.map((athlete) => athlete.id_user)
  }

  async findOneByEmail(email: string) {
    const user = await this.usersRepository.findOne({ where: { email } })
    return user
  }

  async findAll(filters: FilterUserDto) {
    const { page = 1, limit = 10, name, lastname, email } = filters

    const skip = (page - 1) * limit

    const query = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.athletesInCategory', 'athletes_in_categories')
      .leftJoinAndSelect('user.role', 'role')
      .skip(skip)
      .take(limit)
      .orderBy('user.id_user', 'ASC')

    if (name) {
      query.andWhere('user.name ILIKE :name', { name: `%${name}%` })
    }

    if (lastname) {
      query.andWhere('user.lastname ILIKE :lastname', {
        lastname: `%${lastname}%`,
      })
    }

    if (email) {
      query.andWhere('user.email ILIKE :email', { email: `%${email}%` })
    }

    const [users, total] = await query.getManyAndCount()

    if (total === 0)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay usuarios registrados',
      })

    return {
      status: 'Success',
      mensaje: 'Consulta de usuarios exitosa',
      users: plainToInstance(ResponseUserDto, users, {
        excludeExtraneousValues: true,
      }),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  async findAllAthletes(filters: FilterUserDto) {
    const { page = 1, limit = 10, name, lastname, email } = filters

    const skip = (page - 1) * limit

    const query = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.id_role = :idRole', { idRole: ROLE_IDS.DEPORTISTA })
      .skip(skip)
      .take(limit)
      .orderBy('user.id_user', 'ASC')

    if (name) {
      query.andWhere('user.name ILIKE :name', { name: `%${name}%` })
    }

    if (lastname) {
      query.andWhere('user.lastname ILIKE :lastname', {
        lastname: `%${lastname}%`,
      })
    }

    if (email) {
      query.andWhere('user.email ILIKE :email', { email: `%${email}%` })
    }

    const [users, total] = await query.getManyAndCount()

    if (total === 0)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay jugadores registrados',
      })

    return {
      status: 'Success',
      mensaje: 'Consulta de usuarios exitosa',
      users: plainToInstance(ResponseUserDto, users, {
        excludeExtraneousValues: true,
      }),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  async getById(id_user: number) {
    const user = await this.findOneById(id_user)
    if (!user)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este usuario',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de usuario exitosa',
      user: plainToInstance(ResponseUserDto, user, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async create(createUserDto: CreateUserDto) {
    const existsEmail = await this.findOneByEmail(createUserDto.email)
    if (existsEmail)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'Este correo ya esta asociado a un usuario',
      })
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10)
    const id_role = ROLE_IDS.DEPORTISTA
    const user = await this.usersRepository.save({
      ...createUserDto,
      password: hashedPassword,
      id_role: id_role,
    })
    return {
      status: 'Success',
      mensaje: 'Usuario registrado con exito',
      user: plainToInstance(ResponseUserDto, user, {
        excludeExtraneousValues: true,
      }),
    }
  }

  private async assertRoleExists(id_role: number) {
    const role = await this.rolesRepository.findOne({ where: { id_role } })
    if (!role)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe el rol indicado',
      })
    return role
  }

  private async assertEmailAvailable(email: string, currentEmail?: string) {
    if (email === currentEmail) return
    const existsEmail = await this.findOneByEmail(email)
    if (existsEmail)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'Este correo ya esta en uso por otro usuario',
      })
  }

  async createByAdmin(adminCreateUserDto: AdminCreateUserDto) {
    await this.assertEmailAvailable(adminCreateUserDto.email)
    const role = await this.assertRoleExists(adminCreateUserDto.id_role)
    const isAthlete = role.code === 'DEPORTISTA' || role.name === 'DEPORTISTA'
    if (isAthlete && !adminCreateUserDto.birth_date)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'La fecha de nacimiento es obligatoria para los deportistas',
      })
    const saved = await this.usersRepository.save({
      ...adminCreateUserDto,
      birth_date: adminCreateUserDto.birth_date ?? null,
      password: await bcrypt.hash(adminCreateUserDto.password, 10),
    })
    const user = await this.findOneById(saved.id_user)
    return {
      status: 'Success',
      mensaje: 'Usuario creado con exito',
      user: plainToInstance(ResponseUserDto, user, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async update(id_user: number, updateUserDto: UpdateUserDto) {
    const existsUser = await this.findOneById(id_user)
    if (!existsUser)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este usuario',
      })
    if (updateUserDto.email)
      await this.assertEmailAvailable(updateUserDto.email, existsUser.email)
    if (updateUserDto.id_role !== undefined)
      await this.assertRoleExists(updateUserDto.id_role)

    const changes = Object.fromEntries(
      Object.entries(updateUserDto).filter(([, value]) => value !== undefined),
    ) as Partial<User>
    if (updateUserDto.password)
      changes.password = await bcrypt.hash(updateUserDto.password, 10)
    if (Object.keys(changes).length > 0)
      await this.usersRepository.update(id_user, changes)

    const user = await this.findOneById(id_user)
    return {
      status: 'Success',
      mensaje: 'Usuario actualizado con exito',
      user: plainToInstance(ResponseUserDto, user, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async updateProfile(id_user: number, updateMyProfileDto: UpdateMyProfileDto) {
    const { name, lastname, email, birth_date } = updateMyProfileDto
    return this.update(id_user, { name, lastname, email, birth_date })
  }

  async changePassword(id_user: number, changePasswordDto: ChangePasswordDto) {
    const user = await this.usersRepository.findOne({
      where: { id_user },
      select: { id_user: true, password: true },
    })
    if (!user)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este usuario',
      })
    const matches = await bcrypt.compare(
      changePasswordDto.current_password,
      user.password,
    )
    if (!matches)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'La contraseña actual no es correcta',
      })
    await this.usersRepository.update(id_user, {
      password: await bcrypt.hash(changePasswordDto.new_password, 10),
    })
    return { status: 'Success', mensaje: 'Contraseña actualizada con exito' }
  }

  async delete(id_user: number) {
    const user = await this.findOneById(id_user)
    if (!user)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este usuario',
      })
    await this.usersRepository.remove(user)
    return {
      status: 'Success',
      mensaje: 'Usuario eliminado con exito',
      user: plainToInstance(ResponseUserDto, user, {
        excludeExtraneousValues: true,
      }),
    }
  }
}
