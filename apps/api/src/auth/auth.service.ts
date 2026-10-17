import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { AuditService } from '../common/audit.service';
import { MailService } from '../mail/mail.service';
import { isSupportedCountry } from '../common/countries';
import { ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto, ip: string | null) {
    if (!dto.acceptTerms) throw new BadRequestException('Debes aceptar los términos y la política de privacidad');
    const country = dto.country.toUpperCase();
    if (!isSupportedCountry(country)) throw new BadRequestException('País no soportado todavía');
    if (this.config.compliance.globalBlockedCountries.includes(country)) {
      throw new ForbiddenException('Lo sentimos, no podemos aceptar inversores de tu país de residencia');
    }

    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException('Ya existe una cuenta con este correo');

    const verifyToken = this.crypto.randomToken();
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim() || null,
        country,
        emailVerifyToken: this.crypto.sha256Hex(verifyToken),
      },
    });

    await this.mail.sendEmailVerification(user.email, user.firstName, verifyToken);
    await this.audit.log({ actorId: user.id, action: 'auth.register', entity: 'User', entityId: user.id, ip });
    return this.issueTokens(user);
  }

  async login(dto: LoginDto, ip: string | null, userAgent?: string): Promise<TokenPair | { mfaRequired: true }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Comparar siempre para no filtrar qué correos existen por tiempo de respuesta.
    const hash = user?.passwordHash ?? '$2a$12$C6UzMDM.H6dfI/f/IKcEeO3zQ4rN1d1yVQ0o4bRgtL1y3P6QG2E3a';
    const ok = await bcrypt.compare(dto.password, hash);
    if (!user || !ok) {
      await this.audit.log({ action: 'auth.login_failed', entity: 'User', entityId: user?.id, ip, data: { email } });
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Tu cuenta está suspendida');

    if (user.mfaEnabled) {
      if (!dto.mfaCode) return { mfaRequired: true };
      if (!this.checkMfa(user, dto.mfaCode)) throw new UnauthorizedException('Código de verificación incorrecto');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ actorId: user.id, action: 'auth.login', entity: 'User', entityId: user.id, ip });
    return this.issueTokens(user, userAgent);
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<TokenPair> {
    const tokenHash = this.crypto.sha256Hex(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      // Reutilización de un token revocado: posible robo → revocar toda la sesión del usuario.
      if (stored?.revokedAt) {
        await this.prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException('Sesión caducada, vuelve a iniciar sesión');
    }
    if (stored.user.status !== 'ACTIVE') throw new ForbiddenException('Tu cuenta está suspendida');
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    return this.issueTokens(stored.user, userAgent);
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.crypto.sha256Hex(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findUnique({ where: { emailVerifyToken: this.crypto.sha256Hex(token) } });
    if (!user) throw new BadRequestException('Enlace no válido o ya utilizado');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), emailVerifyToken: null },
    });
    return { ok: true };
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return { ok: true };
    const token = this.crypto.randomToken();
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifyToken: this.crypto.sha256Hex(token) } });
    await this.mail.sendEmailVerification(user.email, user.firstName, token);
    return { ok: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS) },
      }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorId: userId, action: 'auth.password_changed', entity: 'User', entityId: userId });
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // MFA (TOTP)
  // ---------------------------------------------------------------------

  async mfaSetup(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabled) throw new BadRequestException('La verificación en dos pasos ya está activada');
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: this.crypto.encrypt(secret) } });
    return { secret, otpauthUrl: authenticator.keyuri(user.email, 'BeanChain', secret) };
  }

  async mfaEnable(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecret) throw new BadRequestException('Primero genera el código de configuración');
    if (!this.checkMfa(user, code)) throw new BadRequestException('Código incorrecto');
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    await this.audit.log({ actorId: userId, action: 'auth.mfa_enabled', entity: 'User', entityId: userId });
    return { ok: true };
  }

  async mfaDisable(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaEnabled) return { ok: true };
    if (!this.checkMfa(user, code)) throw new BadRequestException('Código incorrecto');
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecret: null } });
    await this.audit.log({ actorId: userId, action: 'auth.mfa_disabled', entity: 'User', entityId: userId });
    return { ok: true };
  }

  private checkMfa(user: User, code: string): boolean {
    if (!user.mfaSecret) return false;
    return authenticator.check(code, this.crypto.decrypt(user.mfaSecret));
  }

  // ---------------------------------------------------------------------

  private async issueTokens(user: User, userAgent?: string): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { secret: this.config.jwt.accessSecret, expiresIn: this.config.jwt.accessTtlSeconds },
    );
    const refreshToken = this.crypto.randomToken(48);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.crypto.sha256Hex(refreshToken),
        expiresAt: new Date(Date.now() + this.config.jwt.refreshTtlDays * 86_400_000),
        userAgent: userAgent?.slice(0, 255),
      },
    });
    return { accessToken, refreshToken, expiresIn: this.config.jwt.accessTtlSeconds };
  }
}
