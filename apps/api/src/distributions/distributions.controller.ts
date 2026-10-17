import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { DistributionKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { DistributionsService } from './distributions.service';

class CreateDistributionDto {
  @IsString() opportunityId: string;
  @IsEnum(DistributionKind) kind: DistributionKind;
  @IsInt() @Min(1) totalAmountCents: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class PreviewQuery {
  @IsString() opportunityId: string;
  @Type(() => Number) @IsInt() @Min(1) totalAmountCents: number;
}

@Roles('ADMIN')
@Controller('admin/distributions')
export class DistributionsController {
  constructor(private readonly distributions: DistributionsService) {}

  @Get()
  list(@Query('opportunityId') opportunityId?: string) {
    return this.distributions.list(opportunityId);
  }

  @Get('preview')
  preview(@Query() q: PreviewQuery) {
    return this.distributions.preview(q.opportunityId, q.totalAmountCents);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.distributions.get(id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDistributionDto) {
    return this.distributions.create(user.id, dto);
  }

  @HttpCode(200)
  @Post(':id/execute')
  execute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.distributions.execute(user.id, id);
  }
}
