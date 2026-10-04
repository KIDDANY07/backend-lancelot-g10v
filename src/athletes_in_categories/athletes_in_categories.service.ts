import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { CreateAthletesInCategoryDto } from './dto/create-athletes_in_category.dto'
import { UpdateAthletesInCategoryDto } from './dto/update-athletes_in_category.dto'
import { AthletesInCategory } from './entities/athletes_in_category.entity'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { FilterAthInCat } from './dto/filters-ath_in_cat.dto'
import { plainToInstance } from 'class-transformer'
import { ResponseAthInCat } from './dto/response-ath_cat.dto'
import { UsersService } from 'src/users/users.service'
import { RolesService } from 'src/roles/roles.service'
import { SeasonsService } from 'src/seasons/seasons.service'

@Injectable()
export class AthletesInCategoriesService {
  constructor(
    @InjectRepository(AthletesInCategory)
    private athInCatRepository: Repository<AthletesInCategory>,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly seasonsService: SeasonsService,
  ) {}

  async findOneById(id_ath_cat: number) {
    const athInCat = await this.athInCatRepository.findOne({
      where: { id_ath_cat },
      relations: { user: true },
    })
    return athInCat
  }

  async findOneByIdUser(id_user: number, id_season?: number) {
    const athInCat = await this.athInCatRepository.findOne({
      where: id_season ? { id_user, id_season } : { id_user },
      relations: { user: true },
      order: { created_at: 'DESC' },
    })
    return athInCat
  }

  async findActiveSeasonCategoryMap(): Promise<Map<number, number>> {
    const season = await this.seasonsService.findCurrentActive()
    if (!season) return new Map()
    const assignments = await this.athInCatRepository.find({
      where: { id_season: season.id_season },
      select: { id_user: true, id_category: true },
    })
    return new Map(
      assignments.map((assignment) => [
        assignment.id_user,
        assignment.id_category,
      ]),
    )
  }

  async findActiveSeasonAssignment(id_user: number) {
    const season = await this.seasonsService.findCurrentActive()
    if (!season) return null
    return this.athInCatRepository.findOne({
      where: { id_user, id_season: season.id_season },
    })
  }

  async findActiveSeasonRoster(id_category: number) {
    const season = await this.seasonsService.findCurrentActive()
    if (!season) return { season: null, roster: [] }
    const roster = await this.athInCatRepository
      .createQueryBuilder('assignment')
      .leftJoin('assignment.user', 'user')
      .addSelect(['user.id_user', 'user.name', 'user.lastname'])
      .where('assignment.id_season = :id_season', {
        id_season: season.id_season,
      })
      .andWhere('assignment.id_category = :id_category', { id_category })
      .orderBy('user.lastname', 'ASC')
      .getMany()
    return { season, roster }
  }

  async findHistoryByIdUser(id_user: number) {
    return this.athInCatRepository.find({
      where: { id_user },
      relations: { user: true, category: true, season: true },
      order: { created_at: 'ASC' },
    })
  }

  async findAll(filters: FilterAthInCat) {
    const {
      page = 1,
      limit = 10,
      name,
      lastname,
      id_category,
      category_name,
      id_season,
    } = filters

    const skip = (page - 1) * limit

    const query = this.athInCatRepository
      .createQueryBuilder('athlete_in_category')
      .leftJoin('athlete_in_category.user', 'user')
      .addSelect(['user.id_user', 'user.name', 'user.lastname'])
      .leftJoin('athlete_in_category.category', 'category')
      .addSelect(['category.id_category', 'category.name'])
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

    if (id_category) {
      query.andWhere('athlete_in_category.id_category = :id_category', {
        id_category,
      })
    }

    if (category_name) {
      query.andWhere('category.name ILIKE :category_name', {
        category_name: `%${category_name}%`,
      })
    }

    if (id_season) {
      query.andWhere('athlete_in_category.id_season = :id_season', {
        id_season,
      })
    }

    const [athInCat, total] = await query.getManyAndCount()

    if (total === 0)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay atletas en competencia registrados',
      })

    return {
      status: 'Success',
      mensaje: 'Consulta de deportistas en competencia exitosa',
      athInCat: plainToInstance(ResponseAthInCat, athInCat, {
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

  async getById(id_ath_cat: number) {
    const athInCat = await this.findOneById(id_ath_cat)
    if (!athInCat)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este deportista en categoria',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de deportista en competencia exitosa',
      athInCat: plainToInstance(ResponseAthInCat, athInCat, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async getByIdUser(id_user: number, id_season?: number) {
    const athInCat = await this.findOneByIdUser(id_user, id_season)
    if (!athInCat)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este deportista en categoria',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de deportista en competencia exitosa',
      athInCat: plainToInstance(ResponseAthInCat, athInCat, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async getHistoryByIdUser(id_user: number) {
    const existUser = await this.usersService.findOneById(id_user)
    if (!existUser)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este usuario',
      })
    const history = await this.findHistoryByIdUser(id_user)
    return {
      status: 'Success',
      mensaje: 'Historial de categorías del deportista exitoso',
      history: plainToInstance(ResponseAthInCat, history, {
        excludeExtraneousValues: true,
      }),
    }
  }

  private async assertNoDuplicateAssignment(
    id_user: number,
    id_category: number,
    id_season: number | null | undefined,
    excludeIdAthCat?: number,
  ) {
    const duplicateWhere = id_season
      ? { id_user, id_season }
      : { id_user, id_category }
    const existAthInCat = await this.athInCatRepository.findOne({
      where: duplicateWhere,
    })
    if (existAthInCat && existAthInCat.id_ath_cat !== excludeIdAthCat)
      throw new BadRequestException({
        status: 'Error',
        mensaje: id_season
          ? 'Este deportista ya esta asignado a una categoria en esta temporada'
          : 'Este deportista ya esta en esta categoria',
      })
  }

  async create(createAthletesInCategoryDto: CreateAthletesInCategoryDto) {
    const { id_user, id_category, id_season } = createAthletesInCategoryDto
    const existUser = await this.usersService.findOneById(id_user)
    if (!existUser)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe este usuario',
      })
    if (existUser && existUser.id_role !== 3)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'Este usuario no es un deportista',
      })
    if (id_season) {
      const existSeason = await this.seasonsService.findOneById(id_season)
      if (!existSeason)
        throw new BadRequestException({
          status: 'Error',
          mensaje: 'No existe esta temporada',
        })
    }
    await this.assertNoDuplicateAssignment(id_user, id_category, id_season)
    const athInCat = await this.saveAssignment(createAthletesInCategoryDto)
    return {
      status: 'Success',
      mensaje: 'Deportista asignado a la categoria de forma exitosa',
      athInCat: plainToInstance(ResponseAthInCat, athInCat, {
        excludeExtraneousValues: true,
      }),
    }
  }

  private async saveAssignment(data: Partial<AthletesInCategory>) {
    try {
      return await this.athInCatRepository.save(data)
    } catch (error) {
      if (error?.code === '23505')
        throw new BadRequestException({
          status: 'Error',
          mensaje:
            'Este deportista ya esta asignado a esta categoria o temporada',
        })
      throw error
    }
  }

  async update(
    id_ath_cat: number,
    updateAthletesInCategoryDto: UpdateAthletesInCategoryDto,
  ) {
    const existsAthInCat = await this.findOneById(id_ath_cat)
    if (!existsAthInCat)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este deportista en categoria',
      })
    const id_user =
      updateAthletesInCategoryDto.id_user ?? existsAthInCat.id_user
    const id_category =
      updateAthletesInCategoryDto.id_category ?? existsAthInCat.id_category
    const id_season =
      updateAthletesInCategoryDto.id_season ?? existsAthInCat.id_season
    if (updateAthletesInCategoryDto.id_season) {
      const existSeason = await this.seasonsService.findOneById(
        updateAthletesInCategoryDto.id_season,
      )
      if (!existSeason)
        throw new BadRequestException({
          status: 'Error',
          mensaje: 'No existe esta temporada',
        })
    }
    await this.assertNoDuplicateAssignment(
      id_user,
      id_category,
      id_season,
      id_ath_cat,
    )
    const athInCat = await this.athInCatRepository.merge(
      existsAthInCat,
      updateAthletesInCategoryDto,
    )
    await this.saveAssignment(athInCat)
    return {
      status: 'Success',
      mensaje: 'Deportista en categoria actualizado de forma exitosa',
      athInCat: plainToInstance(ResponseAthInCat, athInCat, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async delete(id_ath_cat: number) {
    const athInCat = await this.findOneById(id_ath_cat)
    if (!athInCat)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este deportista en categoria',
      })
    await this.athInCatRepository.remove(athInCat)
    return {
      status: 'Success',
      mensaje: 'Deportista eliminado de la categoria',
    }
  }
}
