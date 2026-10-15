import { User } from 'src/users/entities/user.entity'
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { HealthRecord } from './health-record.entity'

export enum HealthRecordAccessAction {
  LIST = 'list',
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
}

@Entity('health_record_access_logs')
export class HealthRecordAccessLog {
  @PrimaryGeneratedColumn()
  id_log: number

  @Column({ type: 'int', nullable: true })
  id_health?: number | null

  @Column({ type: 'int', nullable: true })
  accessed_by: number | null

  @Column({ type: 'enum', enum: HealthRecordAccessAction })
  action: HealthRecordAccessAction

  @CreateDateColumn({ type: 'timestamptz' })
  accessed_at: Date

  @ManyToOne(() => HealthRecord, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_health' })
  healthRecord?: HealthRecord | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'accessed_by' })
  accessedByUser: User
}
