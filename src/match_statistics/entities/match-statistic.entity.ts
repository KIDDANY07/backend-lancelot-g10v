import { Match } from 'src/matches/entities/match.entity'
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

@Entity('match_statistics')
export class MatchStatistic {
  @PrimaryGeneratedColumn()
  id_match_stat: number

  @Column()
  id_match: number

  @Column()
  id_user: number

  @Column({ type: 'int' })
  minutes_played: number

  @Column({ type: 'smallint', default: 0 })
  goals: number

  @Column({ type: 'smallint', default: 0 })
  assists: number

  @Column({ type: 'smallint', default: 0 })
  yellow_cards: number

  @Column({ type: 'smallint', default: 0 })
  red_cards: number

  @Column({ type: 'smallint', nullable: true })
  rpe?: number | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  @ManyToOne(() => Match)
  @JoinColumn({ name: 'id_match' })
  match: Match

  @ManyToOne(() => User)
  @JoinColumn({ name: 'id_user' })
  athlete: User
}
