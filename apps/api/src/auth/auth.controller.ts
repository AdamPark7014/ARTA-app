import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { EntityKey } from '@prisma/client';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TotpAccessGuard, TotpEnrollGuard } from './totp-access.guard';

/** Brute-force defense in depth on top of per-account lockout (see auth.service). */
const AUTH_THROTTLE = { default: { limit: 8, ttl: 60_000 } };

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(4)
  password!: string;
}

class TotpVerifyDto {
  @IsString() @MinLength(16) challengeId!: string;
  @IsString() @MinLength(4) code!: string;
}

class TotpCodeDto {
  @IsString() @MinLength(4) code!: string;
}

class DisableTotpDto {
  @IsString() @MinLength(4) password!: string;
}

class HandoffCreateDto {
  @IsEnum(EntityKey)
  entity!: EntityKey;

  @IsOptional()
  @IsString()
  path?: string;
}

class HandoffConsumeDto {
  @IsString()
  @MinLength(16)
  code!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Throttle(AUTH_THROTTLE)
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Req() req: { headers: Record<string, string | string[] | undefined>; ip?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const ua = req.headers['user-agent'];
    return this.auth.login(
      dto.email,
      dto.password,
      {
        userAgent: Array.isArray(ua) ? ua[0] : ua,
        ip: req.ip,
      },
      res,
    );
  }

  @Throttle(AUTH_THROTTLE)
  @Post('2fa/verify-login')
  verifyLogin(
    @Body() dto: TotpVerifyDto,
    @Req() req: { headers: Record<string, string | string[] | undefined>; ip?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const ua = req.headers['user-agent'];
    return this.auth.verifyTotpLogin(
      dto.challengeId,
      dto.code,
      {
        userAgent: Array.isArray(ua) ? ua[0] : ua,
        ip: req.ip,
      },
      res,
    );
  }

  @UseGuards(TotpAccessGuard)
  @Post('2fa/setup')
  setupTotp(@Req() req: { user: { id: string } }) {
    return this.auth.setupTotp(req.user.id);
  }

  @Throttle(AUTH_THROTTLE)
  @UseGuards(TotpEnrollGuard)
  @Post('2fa/complete-enrollment')
  completeEnrollment(
    @Req() req: { user: { id: string }; headers: Record<string, string | string[] | undefined>; ip?: string },
    @Body() dto: TotpCodeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ua = req.headers['user-agent'];
    return this.auth.completeTotpEnrollment(
      req.user.id,
      dto.code,
      { userAgent: Array.isArray(ua) ? ua[0] : ua, ip: req.ip },
      res,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  enableTotp(@Req() req: { user: { id: string } }, @Body() dto: TotpCodeDto) {
    return this.auth.enableTotp(req.user.id, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  disableTotp(@Req() req: { user: { id: string } }, @Body() dto: DisableTotpDto) {
    return this.auth.disableTotp(req.user.id, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    this.auth.clearAuthCookies(res);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: { user: { id: string } }) {
    return { user: await this.auth.me(req.user.id) };
  }

  @UseGuards(JwtAuthGuard)
  @Post('handoff')
  async createHandoff(
    @Req() req: { user: { id: string }; cookies?: Record<string, string> },
    @Body() dto: HandoffCreateDto,
  ) {
    if (!req.cookies?.arta_access) {
      throw new UnauthorizedException('Sesión cookie requerida');
    }
    return this.auth.createHandoff({
      userId: req.user.id,
      entity: dto.entity,
      path: dto.path,
    });
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('handoff/consume')
  consumeHandoff(@Body() dto: HandoffConsumeDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.consumeHandoff(dto.code, res);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  sessions(@Req() req: { user: { id: string } }) {
    return this.auth.listSessions(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sessions/:id/revoke')
  revoke(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.auth.revokeSession(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sessions/revoke-all')
  revokeAll(@Req() req: { user: { id: string } }) {
    return this.auth.revokeAllSessions(req.user.id);
  }
}
