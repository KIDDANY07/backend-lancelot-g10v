import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CreateRoleDto } from './dto/create-role.dto'
import { UpdateRoleDto } from './dto/update-role.dto'
import { Role } from './entities/role.entity'
import { ROLE_IDS, RoleCode } from './role-codes'

@Injectable()
export class RolesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RolesService.name)

  constructor(
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
  ) {}

  async onApplicationBootstrap() {
    await this.ensureFunctionalRoles()
  }

  private async ensureFunctionalRoles() {
    for (const code of Object.values(RoleCode)) {
      const id_role = ROLE_IDS[code]
      const exists = await this.rolesRepository.findOne({
        where: [{ name: code }, { code }],
      })
      if (exists) {
        if (exists.id_role !== id_role)
          this.logger.warn(
            `El rol ${code} tiene id ${exists.id_role} y se esperaba ${id_role}. Ejecuta database/roles.sql para normalizar los roles.`,
          )
        continue
      }
      const idTaken = await this.rolesRepository.findOne({
        where: { id_role },
      })
      if (idTaken) {
        this.logger.warn(
          `No se pudo crear el rol ${code}: el id ${id_role} lo usa ${idTaken.code}. Ejecuta database/roles.sql para normalizar los roles.`,
        )
        continue
      }
      await this.rolesRepository.query(
        'INSERT INTO roles (id_role, name, code) VALUES ($1, $2, $3)',
        [id_role, code, code],
      )
    }
    await this.rolesRepository.query(
      "SELECT setval(pg_get_serial_sequence('roles', 'id_role'), GREATEST((SELECT COALESCE(MAX(id_role), 1) FROM roles), 1))",
    )
  }

  async create(createRoleDto: CreateRoleDto) {
    const exists = await this.rolesRepository.findOne({
      where: [{ name: createRoleDto.name }, { code: createRoleDto.code }],
    })
    if (exists)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'Ya existe un rol con ese nombre o código',
      })
    return this.rolesRepository.save(createRoleDto)
  }

  async findAll() {
    return this.rolesRepository.find({ order: { id_role: 'ASC' } })
  }

  async findOne(id_role: number) {
    const role = await this.rolesRepository.findOne({ where: { id_role } })
    if (!role)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este rol',
      })
    return role
  }

  async update(id_role: number, updateRoleDto: UpdateRoleDto) {
    const role = await this.findOne(id_role)
    if (updateRoleDto.name || updateRoleDto.code) {
      const duplicate = await this.rolesRepository
        .createQueryBuilder('role')
        .where('(role.name = :name OR role.code = :code)', {
          name: updateRoleDto.name ?? role.name,
          code: updateRoleDto.code ?? role.code,
        })
        .andWhere('role.id_role != :id_role', { id_role })
        .getOne()
      if (duplicate)
        throw new BadRequestException({
          status: 'Error',
          mensaje: 'Ya existe un rol con ese nombre o código',
        })
    }
    return this.rolesRepository.save(
      this.rolesRepository.merge(role, updateRoleDto),
    )
  }

  async remove(id_role: number) {
    const role = await this.findOne(id_role)
    await this.rolesRepository.remove(role)
    return { status: 'Success', mensaje: 'Rol eliminado con éxito' }
  }
}
