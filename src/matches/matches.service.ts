import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { CreateMatchDto } from './dto/create-match.dto'
import { UpdateMatchDto } from './dto/update-match.dto'
import { InjectRepository } from '@nestjs/typeorm'
import { Match } from './entities/match.entity'
import { Repository } from 'typeorm'
import { FilterMatchDto } from './dto/filter-match.dto'
import { plainToInstance } from 'class-transformer'
import { ResponseMatchDto } from './dto/response-match.dto'
import { CategoriesService } from 'src/categories/categories.service'
import { CompetenciesService } from 'src/competencies/competencies.service'

@Injectable()
export class MatchesService {
  constructor(
    @InjectRepository(Match) private matchRepository: Repository<Match>,
    private readonly categoriesService: CategoriesService,
    private readonly competenciesService: CompetenciesService,
  ) {}

  async findOneById(id_match: number) {
    const match = await this.matchRepository.findOne({
      where: { id_match },
      relations: { competency: true, category: true },
    })
    return match
  }

  async findAll(filters: FilterMatchDto) {
    const {
      page = 1,
      limit = 10,
      id_category,
      id_competency,
      id_season,
      name_category,
      name_competency,
      location,
    } = filters

    const skip = (page - 1) * limit

    const query = this.matchRepository
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.competency', 'competency')
      .leftJoinAndSelect('match.category', 'category')
      .orderBy('match.date', 'DESC')
      .addOrderBy('match.time', 'DESC')
      .addOrderBy('match.id_match', 'DESC')
      .skip(skip)
      .take(limit)

    if (id_season) {
      query.andWhere('competency.id_season = :id_season', { id_season })
    }

    if (id_competency) {
      query.andWhere('competency.id_competency = :id_competency', {
        id_competency,
      })
    }

    if (id_category) {
      query.andWhere('category.id_category = :id_category', { id_category })
    }

    if (name_competency) {
      query.andWhere('competency.name ILIKE :name_competency', {
        name_competency: `%${name_competency}%`,
      })
    }

    if (name_category) {
      query.andWhere('category.name ILIKE :name_category', {
        name_category: `%${name_category}%`,
      })
    }

    if (location) {
      query.andWhere('match.location ILIKE :location', {
        location: `%${location}%`,
      })
    }

    const [matches, total] = await query.getManyAndCount()

    if (total === 0) {
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay partidos registrados',
      })
    }

    return {
      status: 'Success',
      mensaje: 'Consulta de partidos exitosa',
      matches: plainToInstance(ResponseMatchDto, matches, {
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

  async getById(id_match: number) {
    const match = await this.findOneById(id_match)
    if (!match)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este partido',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de partido exitosa',
      match: plainToInstance(ResponseMatchDto, match, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async create(createMatchDto: CreateMatchDto) {
    const existsCompetency = await this.competenciesService.getById(
      createMatchDto.id_competency,
    )
    if (!existsCompetency)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta competencia',
      })
    const existsCategory = await this.categoriesService.getById(
      createMatchDto.id_category,
    )
    if (!existsCategory)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta categoria',
      })
    const match = await this.matchRepository.save({
      ...createMatchDto,
      id_category: existsCompetency.competency.id_category,
    })
    return {
      status: 'Success',
      mensaje: 'Partido creado con exito',
      match: plainToInstance(ResponseMatchDto, match, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async update(id_match: number, updateMatchDto: UpdateMatchDto) {
    const existsMatch = await this.findOneById(id_match)
    if (!existsMatch)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este partido',
      })
    if (updateMatchDto.id_competency) {
      const existsCompetency = await this.competenciesService.getById(
        updateMatchDto.id_competency,
      )
      if (!existsCompetency)
        throw new NotFoundException({
          status: 'Error',
          mensaje: 'No existe esta competencia',
        })
    }
    if (updateMatchDto.id_category) {
      const existsCategory = await this.categoriesService.getById(
        updateMatchDto.id_category,
      )
      if (!existsCategory)
        throw new NotFoundException({
          status: 'Error',
          mensaje: 'No existe esta categoria',
        })
    }

    const match = await this.matchRepository.merge(existsMatch, updateMatchDto)
    await this.matchRepository.save(match)
    return {
      status: 'Success',
      mensaje: 'Partido actualizado con exito',
      match: plainToInstance(ResponseMatchDto, match, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async delete(id_match: number) {
    const match = await this.findOneById(id_match)
    if (!match)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este partido',
      })
    await this.matchRepository.remove(match)
    return {
      status: 'Success',
      mensaje: 'Partido eliminado con exito',
    }
  }
}
