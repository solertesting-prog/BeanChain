import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { CreateFarmDto, SanctionsCheckDto, UpdateFarmDto } from './farms.dto';
import { FarmsService } from './farms.service';

@Roles('ADMIN', 'OPERATOR')
@Controller('admin/farms')
export class FarmsController {
  constructor(private readonly farms: FarmsService) {}

  @Get()
  list() {
    return this.farms.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.farms.get(id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFarmDto) {
    return this.farms.create(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateFarmDto) {
    return this.farms.update(user.id, id, dto);
  }

  @Roles('ADMIN')
  @Post(':id/sanctions-check')
  sanctions(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SanctionsCheckDto) {
    return this.farms.recordSanctionsCheck(user.id, id, dto);
  }
}
