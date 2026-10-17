import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, RawBodyRequest, Req } from '@nestjs/common';
import { KycStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { KycService } from './kyc.service';

class MockSubmitDto {
  @IsString() @Matches(/^[A-Za-z]{2}$/) nationality: string;
  @IsISO8601() dateOfBirth: string;
  @IsBoolean() isPep: boolean;
  @IsString() @MaxLength(200) sourceOfFunds: string;
}

class ReviewDto {
  @IsBoolean() approve: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class ListKycQuery {
  @IsOptional() @IsEnum(KycStatus) status?: KycStatus;
}

@Controller()
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get('kyc')
  status(@CurrentUser() user: AuthUser) {
    return this.kyc.status(user.id);
  }

  @Post('kyc/start')
  start(@CurrentUser() user: AuthUser) {
    return this.kyc.start(user.id);
  }

  @Post('kyc/mock/submit')
  submit(@CurrentUser() user: AuthUser, @Body() dto: MockSubmitDto) {
    return this.kyc.submitMock(user.id, dto);
  }

  @Public()
  @SkipThrottle()
  @HttpCode(200)
  @Post('kyc/webhook/:provider')
  webhook(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
  ) {
    return this.kyc.handleWebhook(provider, headers, req.rawBody ?? Buffer.from(''));
  }

  @Roles('ADMIN', 'OPERATOR')
  @Get('admin/kyc')
  list(@Query() q: ListKycQuery) {
    return this.kyc.adminList(q.status);
  }

  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(200)
  @Post('admin/kyc/:id/review')
  review(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.kyc.adminReview(actor.id, id, dto.approve, dto.reason ?? null);
  }
}
