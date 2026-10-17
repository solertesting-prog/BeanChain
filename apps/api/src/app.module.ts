import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CoreModule } from './core.module';
import { JwtAuthGuard, RolesGuard } from './common/auth.guards';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { WalletsController } from './wallets/wallets.controller';
import { WalletsService } from './wallets/wallets.service';
import { KycController } from './kyc/kyc.controller';
import { KycService } from './kyc/kyc.service';
import { KYC_PROVIDERS } from './kyc/kyc-provider';
import { MockKycProvider } from './kyc/providers/mock.provider';
import { SumsubKycProvider } from './kyc/providers/sumsub.provider';
import { FarmsController } from './farms/farms.controller';
import { FarmsService } from './farms/farms.service';
import { OpportunitiesController } from './opportunities/opportunities.controller';
import { OpportunitiesService } from './opportunities/opportunities.service';
import { InvestmentsController } from './investments/investments.controller';
import { InvestmentsService } from './investments/investments.service';
import { StripeClient } from './payments/stripe.client';
import { DistributionsController } from './distributions/distributions.controller';
import { DistributionsService } from './distributions/distributions.service';
import { HarvestUpdatesController, HarvestUpdatesService } from './harvest-updates/harvest-updates.controller';
import { DocumentsController } from './documents/documents.controller';
import { DocumentsService } from './documents/documents.service';
import { PortfolioController, PortfolioService } from './portfolio/portfolio.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { AdminController } from './admin/admin.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({}),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: process.env.NODE_ENV === 'test' ? 10_000 : 120 }]),
    CoreModule,
  ],
  controllers: [
    AuthController,
    UsersController,
    WalletsController,
    KycController,
    FarmsController,
    OpportunitiesController,
    InvestmentsController,
    DistributionsController,
    HarvestUpdatesController,
    DocumentsController,
    PortfolioController,
    NotificationsController,
    AdminController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    AuthService,
    UsersService,
    WalletsService,
    MockKycProvider,
    SumsubKycProvider,
    {
      provide: KYC_PROVIDERS,
      useFactory: (mock: MockKycProvider, sumsub: SumsubKycProvider) => [mock, sumsub],
      inject: [MockKycProvider, SumsubKycProvider],
    },
    KycService,
    FarmsService,
    OpportunitiesService,
    StripeClient,
    InvestmentsService,
    DistributionsService,
    HarvestUpdatesService,
    DocumentsService,
    PortfolioService,
  ],
})
export class AppModule {}
