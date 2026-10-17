import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { CreateOpportunityDto, TransitionDto, UpdateOpportunityDto } from './opportunities.dto';
import { OpportunitiesService } from './opportunities.service';

@Controller()
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Public()
  @Get('opportunities')
  list() {
    return this.opportunities.publicList();
  }

  @Public()
  @Get('opportunities/:slug')
  detail(@Param('slug') slug: string, @CurrentUser() user?: AuthUser) {
    return this.opportunities.publicDetail(slug, user);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Get('admin/opportunities')
  adminList() {
    return this.opportunities.adminList();
  }

  @Roles('ADMIN', 'OPERATOR')
  @Get('admin/opportunities/:id')
  adminGet(@Param('id') id: string) {
    return this.opportunities.adminGet(id);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Post('admin/opportunities')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOpportunityDto) {
    return this.opportunities.create(user.id, dto);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Patch('admin/opportunities/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOpportunityDto) {
    return this.opportunities.update(user.id, id, dto);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Get('admin/opportunities/:id/checklist')
  checklist(@Param('id') id: string) {
    return this.opportunities.publishChecklist(id);
  }

  @Roles('ADMIN')
  @HttpCode(200)
  @Post('admin/opportunities/:id/publish')
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.opportunities.publish(user.id, id);
  }

  @Roles('ADMIN')
  @HttpCode(200)
  @Post('admin/opportunities/:id/transition')
  transition(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TransitionDto) {
    return this.opportunities.transition(user.id, id, dto.to, dto.reason);
  }
}
