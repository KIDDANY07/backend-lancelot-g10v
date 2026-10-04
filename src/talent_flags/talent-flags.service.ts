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
import { CreateTalentFlagDto } from './dto/create-talent-flag.dto'
import { FilterTalentFlagDto } from './dto/filter-talent-flag.dto'
import { ResponseTalentFlagDto } from './dto/response-talent-flag.dto'
import { UpdateTalentFlagDto } from './dto/update-talent-flag.dto'
import { TalentFlag, TalentFlagSource } from './entities/talent-flag.entity'

@Injectable()
export class TalentFlagsService {
  constructor(
    @InjectRepository(TalentFlag)
    private readonly talentFlagsRepository: Repository<TalentFlag>,
    private readonly usersService: UsersService,
    private readonly seasonsService: SeasonsService,
  ) {}

  private async validateReferences(
    id_user: number,
    id_season: number,
    created_by: number,
  ) {
    const [athlete, season, creator] = await Promise.all([
      this.usersService.findOneById(id_user),
      this.seasonsService.findOneById(id_season),
      this.usersService.findOneById(created_by),
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
    if (!creator)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe el usuario que registra la señalización',
      })
  }

  async findOneById(id_flag: number) {
    return this.talentFlagsRepository.findOne({
      where: { id_flag },
      relations: { athlete: true },
    })
  }

  async findAll(filters: FilterTalentFlagDto) {
    const { page = 1, limit = 10, id_user, id_season, status, source } = filters
    const query = this.talentFlagsRepository
      .createQueryBuilder('flag')
      .leftJoinAndSelect('flag.athlete', 'athlete')
      .orderBy('flag.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)

    if (id_user) query.andWhere('flag.id_user = :id_user', { id_user })
    if (id_season) query.andWhere('flag.id_season = :id_season', { id_season })
    if (status) query.andWhere('flag.status = :status', { status })
    if (source) query.andWhere('flag.source = :source', { source })

    const [flags, total] = await query.getManyAndCount()
    if (!total)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay señalizaciones de talento registradas',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de señalizaciones de talento exitosa',
      flags: plainToInstance(ResponseTalentFlagDto, flags, {
        excludeExtraneousValues: true,
      }),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async getById(id_flag: number) {
    const flag = await this.findOneById(id_flag)
    if (!flag)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta señalización de talento',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de señalización de talento exitosa',
      flag: plainToInstance(ResponseTalentFlagDto, flag, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async create(createTalentFlagDto: CreateTalentFlagDto) {
    await this.validateReferences(
      createTalentFlagDto.id_user,
      createTalentFlagDto.id_season,
      createTalentFlagDto.created_by,
    )
    const flag = await this.talentFlagsRepository.save({
      ...createTalentFlagDto,
      source: TalentFlagSource.MANUAL,
    })
    return this.getById(flag.id_flag)
  }

  async updateStatus(
    id_flag: number,
    updateTalentFlagDto: UpdateTalentFlagDto,
  ) {
    const flag = await this.findOneById(id_flag)
    if (!flag)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta señalización de talento',
      })
    const updated = this.talentFlagsRepository.merge(flag, updateTalentFlagDto)
    await this.talentFlagsRepository.save(updated)
    return this.getById(id_flag)
  }

  async delete(id_flag: number) {
    const flag = await this.findOneById(id_flag)
    if (!flag)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta señalización de talento',
      })
    await this.talentFlagsRepository.remove(flag)
    return {
      status: 'Success',
      mensaje: 'Señalización de talento eliminada con éxito',
    }
  }
}
