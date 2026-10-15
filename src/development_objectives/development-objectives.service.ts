import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { plainToInstance } from 'class-transformer'
import { Repository } from 'typeorm'
import { SeasonsService } from 'src/seasons/seasons.service'
import { UsersService } from 'src/users/users.service'
import { CreateDevelopmentObjectiveDto } from './dto/create-development-objective.dto'
import { FilterDevelopmentObjectiveDto } from './dto/filter-development-objective.dto'
import { ResponseDevelopmentObjectiveDto } from './dto/response-development-objective.dto'
import { UpdateDevelopmentObjectiveDto } from './dto/update-development-objective.dto'
import { DevelopmentObjective } from './entities/development-objective.entity'

@Injectable()
export class DevelopmentObjectivesService {
  constructor(
    @InjectRepository(DevelopmentObjective)
    private readonly developmentObjectivesRepository: Repository<DevelopmentObjective>,
    private readonly usersService: UsersService,
    private readonly seasonsService: SeasonsService,
  ) {}

  private async validateReferences(
    id_user: number,
    id_season: number,
    set_by: number | null,
  ) {
    const [athlete, season, setByUser] = await Promise.all([
      this.usersService.findOneById(id_user),
      this.seasonsService.findOneById(id_season),
      set_by === null ? null : this.usersService.findOneById(set_by),
    ])
    if (!athlete)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe el deportista indicado',
      })
    if (!season)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe la temporada indicada',
      })
    if (set_by !== null && !setByUser)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe el usuario que define el objetivo',
      })
  }

  async findOneById(id_objective: number) {
    return this.developmentObjectivesRepository.findOne({
      where: { id_objective },
      relations: { athlete: true, season: true, setByUser: true },
    })
  }

  async findAll(filters: FilterDevelopmentObjectiveDto) {
    const { page = 1, limit = 10, id_user, id_season, status } = filters
    const query = this.developmentObjectivesRepository
      .createQueryBuilder('objective')
      .leftJoinAndSelect('objective.athlete', 'athlete')
      .leftJoinAndSelect('objective.season', 'season')
      .leftJoinAndSelect('objective.setByUser', 'setByUser')
      .orderBy('objective.target_date', 'ASC')
      .addOrderBy('objective.id_objective', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)

    if (id_user) query.andWhere('objective.id_user = :id_user', { id_user })
    if (id_season)
      query.andWhere('objective.id_season = :id_season', { id_season })
    if (status) query.andWhere('objective.status = :status', { status })

    const [objectives, total] = await query.getManyAndCount()
    if (!total)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay objetivos de desarrollo registrados',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de objetivos de desarrollo exitosa',
      objectives: plainToInstance(ResponseDevelopmentObjectiveDto, objectives, {
        excludeExtraneousValues: true,
      }),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async getById(id_objective: number) {
    const objective = await this.findOneById(id_objective)
    if (!objective)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este objetivo de desarrollo',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de objetivo de desarrollo exitosa',
      objective: plainToInstance(ResponseDevelopmentObjectiveDto, objective, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async create(createDevelopmentObjectiveDto: CreateDevelopmentObjectiveDto) {
    await this.validateReferences(
      createDevelopmentObjectiveDto.id_user,
      createDevelopmentObjectiveDto.id_season,
      createDevelopmentObjectiveDto.set_by,
    )
    const objective = await this.developmentObjectivesRepository.save(
      createDevelopmentObjectiveDto,
    )
    return this.getById(objective.id_objective)
  }

  async update(
    id_objective: number,
    updateDevelopmentObjectiveDto: UpdateDevelopmentObjectiveDto,
  ) {
    const objective = await this.findOneById(id_objective)
    if (!objective)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este objetivo de desarrollo',
      })
    const updated = this.developmentObjectivesRepository.merge(
      objective,
      updateDevelopmentObjectiveDto,
    )
    await this.validateReferences(
      updated.id_user,
      updated.id_season,
      updated.set_by,
    )
    await this.developmentObjectivesRepository.save(updated)
    return this.getById(id_objective)
  }

  async delete(id_objective: number) {
    const objective = await this.findOneById(id_objective)
    if (!objective)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este objetivo de desarrollo',
      })
    await this.developmentObjectivesRepository.remove(objective)
    return {
      status: 'Success',
      mensaje: 'Objetivo de desarrollo eliminado con éxito',
    }
  }
}
