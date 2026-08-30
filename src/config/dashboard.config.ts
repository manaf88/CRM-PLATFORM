import { registerAs } from '@nestjs/config';

/**
 * Thresholds the dashboard derives SLA states from (BE-08).
 * Kept in config rather than hard-coded so the agency can tune them without a
 * code change — every value has a sane default, so nothing new is required in
 * the environment for the dashboard to work.
 */
export default registerAs('dashboard', () => ({
  timezone: process.env.DASHBOARD_TIMEZONE || 'Asia/Amman',

  /** Hours a post may wait with the client before it is a WARNING. */
  approvalWarningHours: parseInt(
    process.env.APPROVAL_SLA_WARNING_HOURS || '24',
    10,
  ),

  /** Hours a post may wait with the client before it is CRITICAL. */
  approvalCriticalHours: parseInt(
    process.env.APPROVAL_SLA_CRITICAL_HOURS || '48',
    10,
  ),

  /** Hours a changes-requested post may sit untouched before it surfaces. */
  changesRequestedStaleHours: parseInt(
    process.env.CHANGES_REQUESTED_STALE_HOURS || '24',
    10,
  ),
}));
