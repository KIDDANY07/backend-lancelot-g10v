import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UseGuards,
} from '@nestjs/common'
import { ROLE_IDS } from 'src/roles/role-codes'
import { CreateAthletesInCompetencyDto } from './dto/create-athletes_in_competency.dto'
import { UpdateAthletesInCompetencyDto } from './dto/update-athletes_in_competency.dto'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FilterAthInComp } from './dto/filter-athletes_in_competencies.dto'
import { AthletesInCompetency } from './entities/athletes_in_competency.entity'
import { plainToInstance } from 'class-transformer'
import { ResponseAthInComp } from './dto/response-athletes_in_competency.dto'
import { UsersService } from 'src/users/users.service'
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard'
import { RolesGuard } from 'src/auth/guard/roles.guard'

@Injectable()
export class AthletesInCompetenciesService {
  constructor(
    @InjectRepository(AthletesInCompetency)
    private athInCompRepository: Repository<AthletesInCompetency>,
    private readonly usersService: UsersService,
  ) {}

  async findOneById(id_ath_comp: number) {
    const athInComp = await this.athInCompRepository.findOne({
      where: { id_ath_comp },
      relations: { competency: true, user: true },
    })
    return athInComp
  }

  async findOneByUserId(id_user: number) {
    const athInComp = await this.athInCompRepository.findOne({
      where: { id_user },
      relations: { competency: true, user: true },
    })
    return athInComp
  }

  async findAll(filters: FilterAthInComp) {
    const {
      page = 1,
      limit = 10,
      name,
      lastname,
      id_competency,
      competency_name,
    } = filters

    const skip = (page - 1) * limit

    const query = this.athInCompRepository
      .createQueryBuilder('athlete_in_competency')
      .leftJoin('athlete_in_competency.user', 'user')
      .addSelect(['user.id_user', 'user.name', 'user.lastname'])
      .leftJoin('athlete_in_competency.competency', 'competency')
      .addSelect(['competency.id_competency', 'competency.name'])
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

    if (id_competency) {
      query.andWhere('athlete_in_competency.id_competency = :id_competency', {
        id_competency,
      })
    }

    if (competency_name) {
      query.andWhere('competency.name ILIKE :competency_name', {
        competency_name: `%${competency_name}%`,
      })
    }

    const [athInComp, total] = await query.getManyAndCount()

    if (total === 0)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay atletas en competencia registrados',
      })

    return {
      status: 'Success',
      mensaje: 'Consulta de deportistas en competencia exitosa',
      athInCat: plainToInstance(ResponseAthInComp, athInComp, {
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

  async getById(id_ath_comp: number) {
    const athInComp = await this.findOneById(id_ath_comp)
    if (!athInComp)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este deportista en competencia',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de deportista en competencia exitosa',
      athInComp: plainToInstance(ResponseAthInComp, athInComp, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async getByUserId(id_user: number) {
    const athInComp = await this.findOneByUserId(id_user)
    if (!athInComp)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este deportista en competencia',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de deportista en competencia exitosa',
      athInComp: plainToInstance(ResponseAthInComp, athInComp, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async create(createAthletesInCompetencyDto: CreateAthletesInCompetencyDto) {
    const existsUser = await this.usersService.findOneById(
      createAthletesInCompetencyDto.id_user,
    )
    if (!existsUser)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe este usuario',
      })
    if (existsUser && existsUser.id_role !== ROLE_IDS.DEPORTISTA)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'Este usuario no es un deportista',
      })
    const existAthInComp = await this.athInCompRepository.findOne({
      where: {
        id_user: createAthletesInCompetencyDto.id_user,
        id_competency: createAthletesInCompetencyDto.id_competency,
      },
    })
    if (existAthInComp)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'Ester deportista ya esta en esta competencia',
      })
    const athInComp = await this.athInCompRepository.save(
      createAthletesInCompetencyDto,
    )
    return {
      status: 'Success',
      mensaje: 'Deportista asignado a la competencia de forma exitosa',
      athInComp: plainToInstance(ResponseAthInComp, athInComp, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async update(
    id_ath_comp: number,
    updateAthletesInCompetencyDto: UpdateAthletesInCompetencyDto,
  ) {
    const existsAthInComp = await this.findOneById(id_ath_comp)
    if (!existsAthInComp)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este deportista en competencia',
      })
    const existAthInComp = await this.athInCompRepository.findOne({
      where: {
        id_user: updateAthletesInCompetencyDto.id_user,
        id_competency: updateAthletesInCompetencyDto.id_competency,
      },
    })
    if (existAthInComp)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'Este deportista ya esta en esta competencia',
      })
    const athInComp = await this.athInCompRepository.merge(
      existsAthInComp,
      updateAthletesInCompetencyDto,
    )
    await this.athInCompRepository.save(athInComp)
    return {
      status: 'Success',
      mensaje: 'Deportista en competencia actualizado de forma exitosa',
      athInCat: plainToInstance(ResponseAthInComp, athInComp, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async delete(id_ath_comp: number) {
    const athInComp = await this.findOneById(id_ath_comp)
    if (!athInComp)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este deportista en competencia',
      })
    await this.athInCompRepository.remove(athInComp)
    return {
      status: 'Success',
      mensaje: 'Deportista eliminado de la competencia',
    }
  }
}
