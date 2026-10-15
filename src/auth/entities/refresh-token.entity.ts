import { User } from 'src/users/entities/user.entity'
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn()
  id_refresh_token: number

  @Column({ nullable: false })
  id_user: number

  @Column({ nullable: false, length: 64, unique: true })
  token_hash: string

  @Column({ nullable: false, length: 36 })
  family: string

  @Column({ nullable: false, default: false })
  revoked: boolean

  @Column({ type: 'timestamptz', nullable: false })
  expires_at: Date

  @Column({ nullable: true, length: 45 })
  ip: string

  @Column({ nullable: true, length: 255 })
  user_agent: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User
}
