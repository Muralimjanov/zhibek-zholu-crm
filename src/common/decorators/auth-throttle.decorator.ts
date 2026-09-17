import { ExecutionContext, SetMetadata } from '@nestjs/common';

export const AUTH_THROTTLE_KEY = 'authThrottle';

/**
 * Opts a route into the stricter `auth` throttler (AUTH_THROTTLE_LIMIT per
 * AUTH_THROTTLE_TTL_SECONDS, per client IP) on top of the global one.
 * AUTH_SPEC.md §15: rate limiting on login/refresh/reset endpoints.
 */
export const AuthThrottle = () => SetMetadata(AUTH_THROTTLE_KEY, true);

export function isAuthThrottled(context: ExecutionContext): boolean {
  return Reflect.getMetadata(AUTH_THROTTLE_KEY, context.getHandler()) === true;
}
