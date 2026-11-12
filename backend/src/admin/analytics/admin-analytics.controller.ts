import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { AdminAnalyticsService } from './admin-analytics.service';
import {
  AnalyticsQueryDto,
  RevenueSeriesQueryDto,
} from './dto/analytics-query.dto';

@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AdminAnalyticsService) {}

  @Get('summary')
  getSummary(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getSummary(query);
  }

  @Get('revenue-series')
  getRevenueSeries(@Query() query: RevenueSeriesQueryDto) {
    return this.analyticsService.getRevenueSeries(query);
  }
}

