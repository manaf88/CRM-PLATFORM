import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  refreshTokenCookieName:
    process.env.REFRESH_TOKEN_COOKIE_NAME || 'refresh_token',

  // Seeds the first SUPER_ADMIN so the system can be entered at all.
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL || null,
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD || null,
  bootstrapAdminName: process.env.BOOTSTRAP_ADMIN_NAME || 'Solutions Admin',
}));