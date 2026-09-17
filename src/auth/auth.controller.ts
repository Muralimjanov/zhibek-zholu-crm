import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { AuthService, LoginResult } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailCodeDto } from '../email-codes/email-codes.dto';
import { AppConfigService } from '../config/app-config.service';
import { Public } from '../common/decorators/public.decorator';
import { AuthThrottle } from '../common/decorators/auth-throttle.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from './types/authenticated-user';
import { SkipConsent } from '../common/decorators/skip-consent.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from '../users/users.service';

@ApiTags('auth')
@ApiBearerAuth()
@SkipConsent()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfigService,
    private readonly usersService: UsersService,
  ) {}

  /** Attributes shared by set and clear - a cookie is only removed when path/domain match. */
  private cookieBase() {
    return {
      secure: this.config.cookieSecure,
      sameSite: this.config.refreshCookieSameSite,
      domain: this.config.refreshCookieDomain,
    };
  }

  private refreshCookiePath(): string {
    return `/${this.config.apiPrefix.replace(/^\/+|\/+$/g, '')}/auth`;
  }

  /** Returns the CSRF token so a frontend on another site (which cannot read our cookie) can send it back. */
  private setRefreshCookies(res: Response, result: LoginResult): string {
    res.cookie(this.config.refreshCookieName, result.refreshToken, {
      ...this.cookieBase(),
      httpOnly: true,
      path: this.refreshCookiePath(),
      maxAge: this.config.refreshTokenTtlSeconds * 1000,
    });

    // Double-submit CSRF token: readable by JS, compared against a header
    // the browser cannot be tricked into sending cross-site.
    const csrfToken = randomBytes(24).toString('base64url');
    res.cookie(this.config.csrfCookieName, csrfToken, {
      ...this.cookieBase(),
      httpOnly: false,
      path: '/',
      maxAge: this.config.refreshTokenTtlSeconds * 1000,
    });
    return csrfToken;
  }

  private clearRefreshCookies(res: Response) {
    res.clearCookie(this.config.refreshCookieName, {
      ...this.cookieBase(),
      httpOnly: true,
      path: this.refreshCookiePath(),
    });
    res.clearCookie(this.config.csrfCookieName, { ...this.cookieBase(), httpOnly: false, path: '/' });
  }

  private assertCsrf(req: Request) {
    const cookieToken = req.cookies?.[this.config.csrfCookieName];
    const headerToken = req.headers['x-csrf-token'];
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new UnauthorizedException('AUTH_CSRF_INVALID');
    }
  }

  /**
   * Step 1: username + password. Returns `{ mfaRequired: true, challengeId,
   * expiresAt, emailHint }` and emails a code; no session yet.
   */
  @Public()
  @AuthThrottle()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const ctx = { ip: req.ip, userAgent: req.headers['user-agent'] };
    if (!this.config.loginEmailCodeBypassedForTests) {
      const challenge = await this.authService.startLogin(dto.username, dto.password, ctx);
      return { mfaRequired: true, ...challenge };
    }
    return this.sessionResponse(res, await this.authService.login(dto.username, dto.password, ctx));
  }

  /** Step 2: the code from the email. Issues the access token and refresh cookie. */
  @Public()
  @AuthThrottle()
  @Post('login/verify')
  async verifyLogin(@Body() dto: VerifyEmailCodeDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyLoginCode(dto.challengeId, dto.code, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return this.sessionResponse(res, result);
  }

  private sessionResponse(res: Response, result: LoginResult) {
    const csrfToken = this.setRefreshCookies(res, result);
    return {
      accessToken: result.accessToken,
      expiresIn: result.accessTokenExpiresInSeconds,
      // Also in the readable uzz_csrf cookie. Exposing it in the body is safe:
      // CORS prevents other origins from reading this response.
      csrfToken,
      user: this.usersService.toResponse(result.user),
    };
  }

  @Public()
  @AuthThrottle()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertCsrf(req);
    const raw = req.cookies?.[this.config.refreshCookieName];
    if (!raw) throw new UnauthorizedException('AUTH_REFRESH_INVALID');

    const result = await this.authService.refresh(raw, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    const csrfToken = this.setRefreshCookies(res, result);
    return {
      accessToken: result.accessToken,
      expiresIn: result.accessTokenExpiresInSeconds,
      // Also in the readable uzz_csrf cookie. Exposing it in the body is safe:
      // CORS prevents other origins from reading this response.
      csrfToken,
      user: this.usersService.toResponse(result.user),
    };
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertCsrf(req);
    const raw = req.cookies?.[this.config.refreshCookieName];
    if (!raw) {
      throw new BadRequestException('AUTH_REFRESH_MISSING');
    }
    await this.authService.logout(raw, undefined, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.clearRefreshCookies(res);
    return { success: true };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const full = await this.usersService.findById(user.id);
    if (!full) throw new NotFoundException('USER_NOT_FOUND');
    return this.usersService.toResponse(full);
  }
}
