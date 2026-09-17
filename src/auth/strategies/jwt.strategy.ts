import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserStatus } from '@prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../types/authenticated-user';

interface AccessTokenClaims {
  sub: string;
  role: string;
  username: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwtAccessSecret,
    });
  }

  /**
   * Re-checks account status on every request so a disabled user with a
   * still-valid (short-lived) access token is rejected immediately
   * (GATES.md Gate 3 / SECURITY_SPEC.md "compromised employee account").
   */
  async validate(payload: AccessTokenClaims): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.active) {
      throw new UnauthorizedException('AUTH_ACCOUNT_DISABLED');
    }
    return { id: user.id, username: user.username, role: user.role };
  }
}
