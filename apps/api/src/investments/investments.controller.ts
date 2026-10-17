import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthUser, ClientIp, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { StripeClient } from '../payments/stripe.client';
import { ConfirmPaymentDto, CreateInvestmentDto, ListInvestmentsQuery } from './investments.dto';
import { InvestmentsService } from './investments.service';

@Controller()
export class InvestmentsController {
  constructor(
    private readonly investments: InvestmentsService,
    private readonly stripe: StripeClient,
  ) {}

  @HttpCode(200)
  @Post('investments/quote')
  quote(@CurrentUser() user: AuthUser, @Body() dto: CreateInvestmentDto) {
    return this.investments.quote(user.id, dto);
  }

  @Post('investments')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInvestmentDto, @ClientIp() ip: string | null) {
    return this.investments.create(user.id, dto, ip);
  }

  @Get('investments')
  mine(@CurrentUser() user: AuthUser) {
    return this.investments.listMine(user.id);
  }

  @HttpCode(200)
  @Post('investments/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.investments.cancelMine(user.id, id);
  }

  @Public()
  @SkipThrottle()
  @HttpCode(200)
  @Post('payments/webhook/stripe')
  stripeWebhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') sig?: string) {
    const event = this.stripe.verifyWebhook(sig, req.rawBody ?? Buffer.from(''));
    return this.investments.handleStripeWebhook(event);
  }

  // --- Backoffice ---

  @Roles('ADMIN', 'OPERATOR')
  @Get('admin/investments')
  adminList(@Query() q: ListInvestmentsQuery) {
    return this.investments.adminList(q);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Get('admin/investments/by-reference/:reference')
  async byReference(@Param('reference') reference: string) {
    const inv = await this.investments.findByReference(reference);
    if (!inv) throw new NotFoundException('No hay ninguna inversión con esa referencia');
    return inv;
  }

  /** Conciliación de una transferencia bancaria recibida. */
  @Roles('ADMIN')
  @HttpCode(200)
  @Post('admin/investments/:id/confirm-payment')
  confirm(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: ConfirmPaymentDto) {
    return this.investments.confirmPayment({
      investmentId: id,
      provider: 'bank_transfer',
      externalId: dto.bankReference,
      amountCents: dto.amountCents,
      actorId: actor.id,
    });
  }

  @Roles('ADMIN')
  @HttpCode(200)
  @Post('admin/investments/:id/issue')
  issue(@Param('id') id: string) {
    return this.investments.issueTokens(id);
  }
}
