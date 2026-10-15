import { TrainingSession } from 'src/training_sessions/entities/training-session.entity'
import { User } from 'src/users/entities/user.entity'
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('training_loads')
export class TrainingLoad {
  @PrimaryGeneratedColumn()
  id_load: number

  @Column()
  id_session: number

  @Column()
  id_user: number

  @Column({ type: 'smallint' })
  rpe: number

  @Column({ type: 'int' })
  duration_min: number

  @Column({ type: 'int' })
  session_load: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => TrainingSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_session' })
  session: TrainingSession

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  athlete: User
}
