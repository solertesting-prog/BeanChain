import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';

interface AccessPayload {
  sub: string;
  email: string;
  role: Role;
}

/**
 * Guard global: exige un JWT de acceso válido salvo en rutas @Public().
 * En rutas públicas, si llega un token válido, también se adjunta el usuario
 * (útil para mostrar más detalle a inversores autenticados).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Falta el token de acceso');
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: this.config.jwt.accessSecret,
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, status: true },
      });
      if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Cuenta no disponible');
      req.user = { id: user.id, email: user.email, role: user.role } satisfies AuthUser;
      return true;
    } catch (err) {
      if (isPublic) return true;
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Token inválido o caducado');
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!user) throw new UnauthorizedException();
    if (!roles.includes(user.role)) throw new ForbiddenException('No tienes permisos para esta acción');
    return true;
  }
}
