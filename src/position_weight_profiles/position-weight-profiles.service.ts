import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { plainToInstance } from 'class-transformer'
import { Repository } from 'typeorm'
import { CreatePositionWeightProfileDto } from './dto/create-position-weight-profile.dto'
import { FilterPositionWeightProfileDto } from './dto/filter-position-weight-profile.dto'
import { ResponsePositionWeightProfileDto } from './dto/response-position-weight-profile.dto'
import { UpdatePositionWeightProfileDto } from './dto/update-position-weight-profile.dto'
import { PositionWeightProfile } from './entities/position-weight-profile.entity'

const WEIGHT_SUM_TOLERANCE = 0.01

@Injectable()
export class PositionWeightProfilesService {
  constructor(
    @InjectRepository(PositionWeightProfile)
    private readonly positionWeightProfilesRepository: Repository<PositionWeightProfile>,
  ) {}

  private validateWeightsSumToOne(weights: {
    w_physical: number
    w_technical: number
    w_tactical: number
    w_participation: number
  }) {
    const sum =
      Number(weights.w_physical) +
      Number(weights.w_technical) +
      Number(weights.w_tactical) +
      Number(weights.w_participation)
    if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE)
      throw new BadRequestException({
        status: 'Error',
        mensaje: `Los pesos w_physical + w_technical + w_tactical + w_participation deben sumar 1 (suma actual: ${sum.toFixed(2)})`,
      })
  }

  async findOneById(id_profile: number) {
    return this.positionWeightProfilesRepository.findOne({
      where: { id_profile },
    })
  }

  async findByPositionAndAgeCategory(position: string, age_category: string) {
    return this.positionWeightProfilesRepository.findOne({
      where: { position, age_category },
    })
  }

  async findAll(filters: FilterPositionWeightProfileDto) {
    const { page = 1, limit = 10, position, age_category } = filters
    const query = this.positionWeightProfilesRepository
      .createQueryBuilder('profile')
      .orderBy('profile.age_category', 'ASC')
      .addOrderBy('profile.position', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)

    if (position)
      query.andWhere('profile.position ILIKE :position', {
        position: `%${position}%`,
      })
    if (age_category)
      query.andWhere('profile.age_category ILIKE :age_category', {
        age_category: `%${age_category}%`,
      })

    const [profiles, total] = await query.getManyAndCount()
    if (!total)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay perfiles de peso por posición registrados',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de perfiles de peso por posición exitosa',
      profiles: plainToInstance(ResponsePositionWeightProfileDto, profiles, {
        excludeExtraneousValues: true,
      }),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async getById(id_profile: number) {
    const profile = await this.findOneById(id_profile)
    if (!profile)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este perfil de peso por posición',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de perfil de peso por posición exitosa',
      profile: plainToInstance(ResponsePositionWeightProfileDto, profile, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async create(createPositionWeightProfileDto: CreatePositionWeightProfileDto) {
    this.validateWeightsSumToOne(createPositionWeightProfileDto)
    const existing = await this.findByPositionAndAgeCategory(
      createPositionWeightProfileDto.position,
      createPositionWeightProfileDto.age_category,
    )
    if (existing)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'Ya existe un perfil de pesos para esta posición y categoría',
      })
    const profile = await this.positionWeightProfilesRepository.save(
      createPositionWeightProfileDto,
    )
    return {
      status: 'Success',
      mensaje: 'Perfil de peso por posición creado con éxito',
      profile: plainToInstance(ResponsePositionWeightProfileDto, profile, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async update(
    id_profile: number,
    updatePositionWeightProfileDto: UpdatePositionWeightProfileDto,
  ) {
    const profile = await this.findOneById(id_profile)
    if (!profile)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este perfil de peso por posición',
      })
    const updated = this.positionWeightProfilesRepository.merge(
      profile,
      updatePositionWeightProfileDto,
    )
    this.validateWeightsSumToOne(updated)
    await this.positionWeightProfilesRepository.save(updated)
    return {
      status: 'Success',
      mensaje: 'Perfil de peso por posición actualizado con éxito',
      profile: plainToInstance(ResponsePositionWeightProfileDto, updated, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async delete(id_profile: number) {
    const profile = await this.findOneById(id_profile)
    if (!profile)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este perfil de peso por posición',
      })
    await this.positionWeightProfilesRepository.remove(profile)
    return {
      status: 'Success',
      mensaje: 'Perfil de peso por posición eliminado con éxito',
    }
  }
}
