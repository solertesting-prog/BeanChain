import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, ClientIp, CurrentUser, Public } from '../common/auth.decorators';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto, LoginDto, MfaCodeDto, RefreshDto, RegisterDto, VerifyEmailDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto, @ClientIp() ip: string | null) {
    return this.auth.register(dto, ip);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @ClientIp() ip: string | null, @Headers('user-agent') ua?: string) {
    return this.auth.login(dto, ip, ua);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Headers('user-agent') ua?: string) {
    return this.auth.refresh(dto.refreshToken, ua);
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Public()
  @HttpCode(200)
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(200)
  @Post('resend-verification')
  resend(@CurrentUser() user: AuthUser) {
    return this.auth.resendVerification(user.id);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.profile(user.id);
  }

  @HttpCode(200)
  @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto);
  }

  @Post('mfa/setup')
  mfaSetup(@CurrentUser() user: AuthUser) {
    return this.auth.mfaSetup(user.id);
  }

  @HttpCode(200)
  @Post('mfa/enable')
  mfaEnable(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto) {
    return this.auth.mfaEnable(user.id, dto.code);
  }

  @HttpCode(200)
  @Post('mfa/disable')
  mfaDisable(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto) {
    return this.auth.mfaDisable(user.id, dto.code);
  }
}
