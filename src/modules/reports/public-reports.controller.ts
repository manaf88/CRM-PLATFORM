import { BadRequestException, Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ReportSharesService } from './report-shares.service';

/**
 * The one route in the API with no session behind it.
 *
 * Throttled, because the only thing standing between a stranger and a report
 * is the token in the URL, and a wrong token must cost something to try.
 */
@Controller('public/reports')
export class PublicReportsController {
  constructor(private readonly sharesService: ReportSharesService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':token')
  findOne(@Param('token') token: string) {
    // Length only — the value is checked by looking up its hash.
    if (!token || token.length < 20 || token.length > 200) {
      throw new BadRequestException('Invalid link');
    }

    return this.sharesService.findPublicReport(token);
  }
}
