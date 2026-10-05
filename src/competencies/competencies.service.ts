import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { CreateCompetencyDto } from './dto/create-competency.dto'
import { UpdateCompetencyDto } from './dto/update-competency.dto'
import { InjectRepository } from '@nestjs/typeorm'
import { Competency } from './entities/competency.entity'
import { Repository } from 'typeorm'
import { FilterCompetency } from './dto/filter-competency.dto'
import { SeasonsService } from 'src/seasons/seasons.service'

@Injectable()
export class CompetenciesService {
  constructor(
    @InjectRepository(Competency)
    private competencyRepository: Repository<Competency>,
    private readonly seasonsService: SeasonsService,
  ) {}

  async findOneById(id_competency: number) {
    const category = await this.competencyRepository.findOne({
      where: { id_competency },
    })
    return category
  }

  async findAll(filters: FilterCompetency) {
    const {
      page = 1,
      limit = 10,
      name,
      id_season,
      start_date,
      finish_date,
    } = filters

    const skip = (page - 1) * limit

    const query = this.competencyRepository
      .createQueryBuilder('competency')
      .addSelect([
        'competency.id_competency',
        'competency.name',
        'competency.id_season',
        'competency.start_date',
        'competency.finish_date',
      ])
      .skip(skip)
      .take(limit)
      .orderBy('competency.id_competency', 'ASC')

    if (name) {
      query.andWhere('competency.name ILIKE :name', { name: `%${name}%` })
    }

    if (id_season) {
      query.andWhere('competency.id_season = :id_season', { id_season })
    }

    if (start_date) {
      query.andWhere('competency.start_date = :start_date', { start_date })
    }

    if (finish_date) {
      query.andWhere('competency.finish_date =:finish_date', { finish_date })
    }

    const [competency, total] = await query.getManyAndCount()

    if (total === 0)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay competencias registradas',
      })

    return {
      status: 'Success',
      mensaje: 'Consulta de competencias exitosa',
      competency,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  async getById(id_competency: number) {
    const competency = await this.findOneById(id_competency)
    if (!competency)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta competencia',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de competencia exitosa',
      competency,
    }
  }

  async create(createCompetencyDto: CreateCompetencyDto) {
    const existsSeason = await this.seasonsService.findOneById(
      createCompetencyDto.id_season,
    )
    if (!existsSeason)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe esta temporada',
      })
    const { finish, ...competencyData } = createCompetencyDto
    const competency = await this.competencyRepository.save({
      ...competencyData,
      ...(finish ? { finish_date: finish } : {}),
    })
    return {
      status: 'Success',
      mensaje: 'Creacion de competencia exitosa',
      competency,
    }
  }

  async update(
    id_competency: number,
    updateCompetencyDto: UpdateCompetencyDto,
  ) {
    const existsCompetency = await this.findOneById(id_competency)
    if (!existsCompetency)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta competencia',
      })
    if (updateCompetencyDto.id_season) {
      const existsSeason = await this.seasonsService.findOneById(
        updateCompetencyDto.id_season,
      )
      if (!existsSeason)
        throw new BadRequestException({
          status: 'Error',
          mensaje: 'No existe esta temporada',
        })
    }
    const { finish, ...competencyChanges } = updateCompetencyDto
    const competency = this.competencyRepository.merge(existsCompetency, {
      ...competencyChanges,
      ...(finish !== undefined ? { finish_date: finish } : {}),
    })
    await this.competencyRepository.save(competency)
    return {
      status: 'Success',
      mensaje: 'competencia actualizada con exito',
      competency,
    }
  }

  async delete(id_competency: number) {
    const competency = await this.findOneById(id_competency)
    if (!competency)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta competencia',
      })
    await this.competencyRepository.remove(competency)
    return {
      status: 'Success',
      mensaje: 'competencia eliminada con exito',
      competency,
    }
  }
}
