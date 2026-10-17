import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { InvestorCategory, Role, UserStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { UsersService } from './users.service';

class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 80) firstName?: string;
  @IsOptional() @IsString() @Length(1, 120) lastName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @Length(2, 5) locale?: string;
}

class AdminUpdateUserDto {
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsEnum(InvestorCategory) investorCategory?: InvestorCategory;
}

class ListUsersQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Get('admin/users')
  list(@Query() q: ListUsersQuery) {
    return this.users.list(q);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Get('admin/users/:id')
  get(@Param('id') id: string) {
    return this.users.profile(id);
  }

  @Roles('ADMIN')
  @Patch('admin/users/:id')
  update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return this.users.adminUpdate(actor.id, id, dto);
  }
}
