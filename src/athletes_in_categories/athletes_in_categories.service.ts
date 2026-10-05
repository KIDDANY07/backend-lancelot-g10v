import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ROLE_IDS } from 'src/roles/role-codes'
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
import { Category } from 'src/categories/entities/category.entity'
import {
  checkCategoryEligibility,
  pickBaseAssignments,
  referenceYearOf,
} from 'src/common/utils/sport-age.util'

@Injectable()
export class AthletesInCategoriesService {
  constructor(
    @InjectRepository(AthletesInCategory)
    private athInCatRepository: Repository<AthletesInCategory>,
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
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

  private findDetailed(id_ath_cat: number) {
    return this.athInCatRepository.findOne({
      where: { id_ath_cat },
      relations: { user: true, category: true },
    })
  }

  private orderedByAgeGroup(id_user: number, id_season?: number | null) {
    const query = this.athInCatRepository
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.user', 'user')
      .leftJoinAndSelect('assignment.category', 'category')
      .where('assignment.id_user = :id_user', { id_user })
      .orderBy('category.max_age', 'ASC')
      .addOrderBy('assignment.id_ath_cat', 'ASC')
    if (id_season)
      query.andWhere('assignment.id_season = :id_season', { id_season })
    return query
  }

  async findAllByIdUser(id_user: number, id_season?: number | null) {
    return this.orderedByAgeGroup(id_user, id_season).getMany()
  }

  async findOneByIdUser(id_user: number, id_season?: number) {
    if (id_season) return this.orderedByAgeGroup(id_user, id_season).getOne()
    return this.athInCatRepository.findOne({
      where: { id_user },
      relations: { user: true, category: true },
      order: { created_at: 'DESC' },
    })
  }

  async findActiveSeasonCategoryMap(): Promise<Map<number, number>> {
    const season = await this.seasonsService.findCurrentActive()
    if (!season) return new Map()
    const assignments = await this.athInCatRepository.find({
      where: { id_season: season.id_season },
      relations: { category: true },
    })
    const base = pickBaseAssignments(assignments, (assignment) =>
      Number(assignment.category?.max_age ?? Infinity),
    )
    return new Map(
      [...base.values()].map((assignment) => [
        assignment.id_user,
        assignment.id_category,
      ]),
    )
  }

  async findActiveSeasonAssignment(id_user: number) {
    const season = await this.seasonsService.findCurrentActive()
    if (!season) return null
    return this.orderedByAgeGroup(id_user, season.id_season).getOne()
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
    const athInCat = await this.findDetailed(id_ath_cat)
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

  async getByIdUser(id_user: number) {
    const season = await this.seasonsService.findCurrentActive()
    let assignments = season
      ? await this.findAllByIdUser(id_user, season.id_season)
      : []
    if (assignments.length === 0) {
      const latest = await this.findOneByIdUser(id_user)
      assignments = latest
        ? latest.id_season
          ? await this.findAllByIdUser(id_user, latest.id_season)
          : [latest]
        : []
    }
    if (assignments.length === 0)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este deportista en categoria',
      })
    const items = plainToInstance(ResponseAthInCat, assignments, {
      excludeExtraneousValues: true,
    })
    return {
      status: 'Success',
      mensaje: 'Consulta de las categorías del deportista exitosa',
      athInCat: items[0],
      athInCats: items,
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
    const existAthInCat = await this.athInCatRepository.findOne({
      where: id_season
        ? { id_user, id_season, id_category }
        : { id_user, id_category },
    })
    if (existAthInCat && existAthInCat.id_ath_cat !== excludeIdAthCat)
      throw new BadRequestException({
        status: 'Error',
        mensaje: id_season
          ? 'Este deportista ya esta en esta categoria en esta temporada'
          : 'Este deportista ya esta en esta categoria',
      })
  }

  private async assertEligible(
    birth_date: string | null | undefined,
    id_category: number,
    id_season: number | null | undefined,
  ) {
    const category = await this.categoriesRepository.findOne({
      where: { id_category },
    })
    if (!category)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe esta categoria',
      })
    const season = id_season
      ? await this.seasonsService.findOneById(id_season)
      : null
    if (id_season && !season)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe esta temporada',
      })
    const eligibility = checkCategoryEligibility(
      birth_date,
      category,
      referenceYearOf(season?.start_date),
    )
    if (!eligibility.eligible)
      throw new BadRequestException({
        status: 'Error',
        mensaje: eligibility.reason,
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
    if (existUser && existUser.id_role !== ROLE_IDS.DEPORTISTA)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'Este usuario no es un deportista',
      })
    await this.assertEligible(existUser.birth_date, id_category, id_season)
    await this.assertNoDuplicateAssignment(id_user, id_category, id_season)
    const saved = await this.saveAssignment(createAthletesInCategoryDto)
    const athInCat = await this.findDetailed(saved.id_ath_cat)
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
            'Este deportista ya esta en esta categoria en esta temporada',
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
    const athlete =
      id_user === existsAthInCat.id_user
        ? existsAthInCat.user
        : await this.usersService.findOneById(id_user)
    if (!athlete)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe este usuario',
      })
    if (athlete.id_role !== ROLE_IDS.DEPORTISTA)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'Este usuario no es un deportista',
      })
    await this.assertEligible(athlete.birth_date, id_category, id_season)
    await this.assertNoDuplicateAssignment(
      id_user,
      id_category,
      id_season,
      id_ath_cat,
    )
    await this.saveAssignment({ id_ath_cat, ...updateAthletesInCategoryDto })
    const athInCat = await this.findDetailed(id_ath_cat)
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
