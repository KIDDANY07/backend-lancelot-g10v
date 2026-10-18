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
import { CreateTechnicalEvaluationDto } from './dto/create-technical-evaluation.dto'
import { FilterTechnicalEvaluationDto } from './dto/filter-technical-evaluation.dto'
import { ResponseTechnicalEvaluationDto } from './dto/response-technical-evaluation.dto'
import { UpdateTechnicalEvaluationDto } from './dto/update-technical-evaluation.dto'
import { TechnicalEvaluation } from './entities/technical-evaluation.entity'
import {
  EVALUATION_INDICATORS,
  EvaluationDimension,
  indicatorErrorFor,
} from './evaluation-catalog'

@Injectable()
export class TechnicalEvaluationsService {
  constructor(
    @InjectRepository(TechnicalEvaluation)
    private readonly technicalEvaluationsRepository: Repository<TechnicalEvaluation>,
    private readonly usersService: UsersService,
    private readonly seasonsService: SeasonsService,
  ) {}

  private async validateReferences(
    id_user: number,
    id_season: number,
    evaluator_id: number | null,
  ) {
    const [athlete, season, evaluator] = await Promise.all([
      this.usersService.findOneById(id_user),
      this.seasonsService.findOneById(id_season),
      evaluator_id === null
        ? null
        : this.usersService.findOneById(evaluator_id),
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
    if (evaluator_id !== null && !evaluator)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe el evaluador indicado',
      })
  }

  private assertIndicator(dimension: EvaluationDimension, indicator: string) {
    const mensaje = indicatorErrorFor(dimension, indicator)
    if (mensaje) throw new BadRequestException({ status: 'Error', mensaje })
  }

  getCatalog() {
    return {
      status: 'Success',
      mensaje: 'Catálogo de indicadores técnicos y tácticos',
      catalog: Object.values(EvaluationDimension).map((dimension) => ({
        dimension,
        indicators: EVALUATION_INDICATORS[dimension],
      })),
    }
  }

  async findOneById(id_eval_tech: number) {
    return this.technicalEvaluationsRepository.findOne({
      where: { id_eval_tech },
      relations: { athlete: true, season: true, evaluator: true },
    })
  }

  async findAll(filters: FilterTechnicalEvaluationDto) {
    const {
      page = 1,
      limit = 10,
      id_user,
      id_season,
      dimension,
      indicator,
      eval_date,
    } = filters
    const query = this.technicalEvaluationsRepository
      .createQueryBuilder('evaluation')
      .leftJoinAndSelect('evaluation.athlete', 'athlete')
      .leftJoinAndSelect('evaluation.season', 'season')
      .leftJoinAndSelect('evaluation.evaluator', 'evaluator')
      .orderBy('evaluation.eval_date', 'DESC')
      .addOrderBy('evaluation.id_eval_tech', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)

    if (id_user) query.andWhere('evaluation.id_user = :id_user', { id_user })
    if (id_season)
      query.andWhere('evaluation.id_season = :id_season', { id_season })
    if (dimension)
      query.andWhere('evaluation.dimension = :dimension', { dimension })
    if (indicator)
      query.andWhere('evaluation.indicator ILIKE :indicator', {
        indicator: `%${indicator}%`,
      })
    if (eval_date)
      query.andWhere('evaluation.eval_date = :eval_date', { eval_date })

    const [evaluations, total] = await query.getManyAndCount()
    if (!total)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay evaluaciones técnicas registradas',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de evaluaciones técnicas exitosa',
      evaluations: plainToInstance(
        ResponseTechnicalEvaluationDto,
        evaluations,
        {
          excludeExtraneousValues: true,
        },
      ),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async getById(id_eval_tech: number) {
    const evaluation = await this.findOneById(id_eval_tech)
    if (!evaluation)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta evaluación técnica',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de evaluación técnica exitosa',
      evaluation: plainToInstance(ResponseTechnicalEvaluationDto, evaluation, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async getTimeline(id_user: number) {
    const athlete = await this.usersService.findOneById(id_user)
    if (!athlete)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe el deportista indicado',
      })
    const evaluations = await this.technicalEvaluationsRepository.find({
      where: { id_user },
      relations: { athlete: true, season: true, evaluator: true },
      order: { eval_date: 'ASC', id_eval_tech: 'ASC' },
    })
    return {
      status: 'Success',
      mensaje: 'Historial de evaluaciones técnicas exitoso',
      evaluations: plainToInstance(
        ResponseTechnicalEvaluationDto,
        evaluations,
        {
          excludeExtraneousValues: true,
        },
      ),
    }
  }

  async create(createTechnicalEvaluationDto: CreateTechnicalEvaluationDto) {
    this.assertIndicator(
      createTechnicalEvaluationDto.dimension,
      createTechnicalEvaluationDto.indicator,
    )
    await this.validateReferences(
      createTechnicalEvaluationDto.id_user,
      createTechnicalEvaluationDto.id_season,
      createTechnicalEvaluationDto.evaluator_id,
    )
    const evaluation = await this.technicalEvaluationsRepository.save(
      createTechnicalEvaluationDto,
    )
    return this.getById(evaluation.id_eval_tech)
  }

  async update(
    id_eval_tech: number,
    updateTechnicalEvaluationDto: UpdateTechnicalEvaluationDto,
  ) {
    const evaluation = await this.findOneById(id_eval_tech)
    if (!evaluation)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta evaluación técnica',
      })
    const updated = this.technicalEvaluationsRepository.merge(
      evaluation,
      updateTechnicalEvaluationDto,
    )
    if (
      updateTechnicalEvaluationDto.dimension !== undefined ||
      updateTechnicalEvaluationDto.indicator !== undefined
    )
      this.assertIndicator(updated.dimension, updated.indicator)
    await this.validateReferences(
      updated.id_user,
      updated.id_season,
      updated.evaluator_id,
    )
    await this.technicalEvaluationsRepository.save(updated)
    return this.getById(id_eval_tech)
  }

  async delete(id_eval_tech: number) {
    const evaluation = await this.findOneById(id_eval_tech)
    if (!evaluation)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta evaluación técnica',
      })
    await this.technicalEvaluationsRepository.remove(evaluation)
    return {
      status: 'Success',
      mensaje: 'Evaluación técnica eliminada con éxito',
    }
  }
}
