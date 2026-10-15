import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThan, Repository } from 'typeorm'
import { Cron, CronExpression } from '@nestjs/schedule'
import { UsersService } from 'src/users/users.service'
import { RegisterUserDto } from './dto/register-user.dto'
import { LoginUserDto } from './dto/login-user.dto'
import { RefreshTokenDto } from './dto/refresh-token.dto'
import { RefreshToken } from './entities/refresh-token.entity'
import { randomBytes, randomUUID, createHash } from 'crypto'
import * as bcrypt from 'bcryptjs'

@Injectable()
export class AuthService {
  private readonly refreshExpiresDays: number

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
  ) {
    this.refreshExpiresDays = Number(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_DAYS') ?? 30,
    )
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex')
  }

  private buildAccessToken(id_user: number, id_role: number, email: string) {
    const payload = { id: id_user, id_role, email }
    return this.jwtService.sign(payload)
  }

  private async issueRefreshToken(
    id_user: number,
    family: string,
    ip?: string,
    userAgent?: string,
  ) {
    const token = randomBytes(64).toString('base64url')
    const expires_at = new Date(
      Date.now() + this.refreshExpiresDays * 24 * 60 * 60 * 1000,
    )

    await this.refreshTokensRepository.save({
      id_user,
      token_hash: this.hashToken(token),
      family,
      revoked: false,
      expires_at,
      ip,
      user_agent: userAgent,
    })

    return token
  }

  private async buildTokenPair(
    id_user: number,
    id_role: number,
    email: string,
    family: string,
    ip?: string,
    userAgent?: string,
  ) {
    return {
      access_token: this.buildAccessToken(id_user, id_role, email),
      refresh_token: await this.issueRefreshToken(
        id_user,
        family,
        ip,
        userAgent,
      ),
    }
  }

  async register(registerUserDto: RegisterUserDto) {
    const { accept_data_policy, ...data } = registerUserDto
    return this.usersService.create(data, accept_data_policy)
  }

  async login(loginUserDto: LoginUserDto, ip?: string, userAgent?: string) {
    const user = await this.usersService.findOneByEmail(loginUserDto.email)
    if (!user)
      throw new UnauthorizedException({
        status: 'Error',
        mensaje: 'Este correo no esta asociado a ninguna cuenta',
      })

    const isMatch = await bcrypt.compare(loginUserDto.password, user.password)
    if (!isMatch)
      throw new UnauthorizedException({
        status: 'Error',
        mensaje: 'Contraseña incorrecta',
      })

    const family = randomUUID()

    return {
      status: 'Success',
      mensaje: 'Inicio de sesion exitoso',
      token: await this.buildTokenPair(
        user.id_user,
        user.id_role,
        user.email,
        family,
        ip,
        userAgent,
      ),
    }
  }

  async refresh(
    refreshTokenDto: RefreshTokenDto,
    ip?: string,
    userAgent?: string,
  ) {
    const tokenHash = this.hashToken(refreshTokenDto.refresh_token)
    const stored = await this.refreshTokensRepository.findOne({
      where: { token_hash: tokenHash },
    })

    if (!stored)
      throw new UnauthorizedException({
        status: 'Error',
        mensaje: 'Refresh token invalido',
      })

    if (stored.revoked || stored.expires_at < new Date()) {
      await this.revokeAllForUser(stored.id_user)
      throw new UnauthorizedException({
        status: 'Error',
        mensaje:
          'Refresh token invalido, se han cerrado todas las sesiones por seguridad',
      })
    }

    const user = await this.usersService.findOneById(stored.id_user)
    if (!user)
      throw new UnauthorizedException({
        status: 'Error',
        mensaje: 'No esta autorizado',
      })

    stored.revoked = true
    await this.refreshTokensRepository.save(stored)

    return {
      status: 'Success',
      mensaje: 'Token renovado exitosamente',
      token: await this.buildTokenPair(
        user.id_user,
        user.id_role,
        user.email,
        stored.family,
        ip,
        userAgent,
      ),
    }
  }

  async logout(refreshTokenDto: RefreshTokenDto) {
    const tokenHash = this.hashToken(refreshTokenDto.refresh_token)
    await this.refreshTokensRepository.update(
      { token_hash: tokenHash },
      { revoked: true },
    )

    return {
      status: 'Success',
      mensaje: 'Sesion cerrada exitosamente',
    }
  }

  async logoutAll(id_user: number) {
    await this.revokeAllForUser(id_user)

    return {
      status: 'Success',
      mensaje: 'Todas las sesiones han sido cerradas',
    }
  }

  private async revokeAllForUser(id_user: number) {
    await this.refreshTokensRepository.update(
      { id_user, revoked: false },
      { revoked: true },
    )
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredTokens() {
    await this.refreshTokensRepository.delete({
      expires_at: LessThan(new Date()),
    })
  }
}
