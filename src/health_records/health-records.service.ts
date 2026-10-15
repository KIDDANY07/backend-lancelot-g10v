import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { plainToInstance } from 'class-transformer'
import { Repository } from 'typeorm'
import { ParentalConsentsService } from 'src/parental_consents/parental-consents.service'
import { UsersService } from 'src/users/users.service'
import { CreateHealthRecordDto } from './dto/create-health-record.dto'
import { FilterHealthRecordDto } from './dto/filter-health-record.dto'
import { ResponseHealthRecordDto } from './dto/response-health-record.dto'
import { UpdateHealthRecordDto } from './dto/update-health-record.dto'
import { HealthRecord } from './entities/health-record.entity'

@Injectable()
export class HealthRecordsService {
  constructor(
    @InjectRepository(HealthRecord)
    private readonly healthRecordsRepository: Repository<HealthRecord>,
    private readonly usersService: UsersService,
    private readonly parentalConsentsService: ParentalConsentsService,
  ) {}

  private async validateReferences(
    id_user: number,
    registered_by: number | null,
  ) {
    const athlete = await this.usersService.findOneById(id_user)
    if (!athlete)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe el deportista indicado',
      })

    const registeredByUser =
      registered_by === null
        ? null
        : await this.usersService.findOneById(registered_by)
    if (registered_by !== null && !registeredByUser)
      throw new BadRequestException({
        status: 'Error',
        mensaje: 'No existe el usuario que registra el dato de salud',
      })

    const isMinor = await this.parentalConsentsService.isAthleteMinor(id_user)
    if (isMinor) {
      const hasGrantedConsent =
        await this.parentalConsentsService.hasGrantedConsent(id_user)
      if (!hasGrantedConsent)
        throw new BadRequestException({
          status: 'Error',
          mensaje:
            'El deportista es menor de edad y no cuenta con un consentimiento parental otorgado (status = granted)',
        })
    }
  }

  async findOneById(id_health: number) {
    return this.healthRecordsRepository.findOne({
      where: { id_health },
      relations: { athlete: true, registeredByUser: true },
    })
  }

  async findAll(filters: FilterHealthRecordDto) {
    const { page = 1, limit = 10, id_user, status } = filters
    const query = this.healthRecordsRepository
      .createQueryBuilder('health_record')
      .leftJoinAndSelect('health_record.athlete', 'athlete')
      .leftJoinAndSelect('health_record.registeredByUser', 'registeredByUser')
      .orderBy('health_record.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)

    if (id_user) query.andWhere('health_record.id_user = :id_user', { id_user })
    if (status) query.andWhere('health_record.status = :status', { status })

    const [records, total] = await query.getManyAndCount()
    if (!total)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No hay registros de salud disponibles',
      })

    return {
      status: 'Success',
      mensaje: 'Consulta de registros de salud exitosa',
      records: plainToInstance(ResponseHealthRecordDto, records, {
        excludeExtraneousValues: true,
      }),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async getById(id_health: number) {
    const record = await this.findOneById(id_health)
    if (!record)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este registro de salud',
      })
    return {
      status: 'Success',
      mensaje: 'Consulta de registro de salud exitosa',
      record: plainToInstance(ResponseHealthRecordDto, record, {
        excludeExtraneousValues: true,
      }),
    }
  }

  async create(createHealthRecordDto: CreateHealthRecordDto) {
    await this.validateReferences(
      createHealthRecordDto.id_user,
      createHealthRecordDto.registered_by,
    )
    const record = await this.healthRecordsRepository.save(
      createHealthRecordDto,
    )
    return this.getById(record.id_health)
  }

  async update(
    id_health: number,
    updateHealthRecordDto: UpdateHealthRecordDto,
  ) {
    const record = await this.findOneById(id_health)
    if (!record)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este registro de salud',
      })
    const updated = this.healthRecordsRepository.merge(
      record,
      updateHealthRecordDto,
    )
    await this.validateReferences(updated.id_user, updated.registered_by)
    await this.healthRecordsRepository.save(updated)
    return this.getById(id_health)
  }

  async delete(id_health: number) {
    const record = await this.findOneById(id_health)
    if (!record)
      throw new NotFoundException({
        status: 'Error',
        mensaje: 'No existe este registro de salud',
      })
    await this.healthRecordsRepository.remove(record)
    return {
      status: 'Success',
      mensaje: 'Registro de salud eliminado con éxito',
    }
  }
}
