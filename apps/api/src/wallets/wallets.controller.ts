import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString, Matches, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { WalletsService } from './wallets.service';

class LinkWalletDto {
  @IsString() @Matches(/^0x[0-9a-fA-F]{40}$/) address: string;
  @IsString() @MaxLength(200) signature: string;
}

@Controller('wallet')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.wallets.get(user.id);
  }

  @Get('link-message')
  message(@CurrentUser() user: AuthUser) {
    return { template: WalletsService.linkMessage(user.id, '0x0000000000000000000000000000000000000000').replace(/0x0{40}/, '{address}') };
  }

  @Post('link')
  link(@CurrentUser() user: AuthUser, @Body() dto: LinkWalletDto) {
    return this.wallets.linkExternal(user.id, dto.address, dto.signature);
  }
}
