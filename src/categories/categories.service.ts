import { Injectable, NotFoundException } from '@nestjs/common'
import { CreateCategoryDto } from './dto/create-category.dto'
import { UpdateCategoryDto } from './dto/update-category.dto'
import { InjectRepository } from '@nestjs/typeorm'
import { Category } from './entities/category.entity'
import { Repository } from 'typeorm'
import { FilterCategory } from './dto/filter-category.dto'
import { plainToInstance } from 'class-transformer'
import {
  assertNoReferences,
  countReferences,
} from 'src/common/utils/delete-guard.util'

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
  ) {}

  async findOneById(id_category: number) {
    const category = await this.categoryRepository.findOne({
      where: { id_category },
    })
    return category
  }

  async findAll(filters: FilterCategory) {
    const { page = 1, limit = 10, name, min_age, max_age } = filters

    const skip = (page - 1) * limit

    const query = this.categoryRepository
      .createQueryBuilder('category')
      .addSelect([
        'category.id_category',
        'category.name',
        'category.min_age',
        'category.max_age',
      ])
      .skip(skip)
      .take(limit)
      .orderBy('category.id_category', 'ASC')

    if (name) {
      query.andWhere('category.name ILIKE :name', { name: `%${name}%` })
    }

    if (min_age) {
      query.andWhere('category.min_age = :min_age', { min_age })
    }

    if (max_age) {
      query.andWhere('category.max_age =:max_age', { max_age })
    }

    const [category, total] = await query.getManyAndCount()

    if (total === 0)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay categorias registradas',
      })

    return {
      status: 'Success',
      mensaje: 'Consulta de categorias exitosa',
      category,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  async getById(id_category: number) {
    const category = await this.findOneById(id_category)
    if (!category)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta categoria',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de categoria exitosa',
      category,
    }
  }

  async create(createCategoryDto: CreateCategoryDto) {
    const category = await this.categoryRepository.save(createCategoryDto)
    return {
      status: 'Success',
      mensaje: 'Creacion de categoria exitosa',
      category,
    }
  }

  async update(id_category: number, updateCategoryDto: UpdateCategoryDto) {
    const existsCategory = await this.findOneById(id_category)
    if (!existsCategory)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta categoria',
      })
    const category = await this.categoryRepository.merge(
      existsCategory,
      updateCategoryDto,
    )
    await this.categoryRepository.save(category)
    return {
      status: 'Success',
      mensaje: 'Categoria actualizada con exito',
      category,
    }
  }

  async delete(id_category: number) {
    const category = await this.findOneById(id_category)
    if (!category)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe esta categoria',
      })
    const references = await countReferences(
      this.categoryRepository.manager,
      [
        {
          table: 'athletes_in_categories',
          column: 'id_category',
          singular: 'asignación de deportista',
          plural: 'asignaciones de deportistas',
        },
        {
          table: 'competencies',
          column: 'id_category',
          singular: 'competencia',
          plural: 'competencias',
        },
        {
          table: 'matches',
          column: 'id_category',
          singular: 'partido',
          plural: 'partidos',
        },
        {
          table: 'training_sessions',
          column: 'id_category',
          singular: 'sesión de entrenamiento',
          plural: 'sesiones de entrenamiento',
        },
      ],
      id_category,
    )
    assertNoReferences(
      `la categoría ${category.name}`,
      references,
      'Esa información forma parte del historial de los deportistas; conserva la categoría o elimina primero esos registros.',
    )
    await this.categoryRepository.remove(category)
    return {
      status: 'Success',
      mensaje: 'Categoria eliminada con exito',
      category,
    }
  }
}
