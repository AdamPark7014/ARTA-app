import { Body, Controller, Delete, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DevicesService, type PushPlatform } from './devices.service';

type AuthUser = { id: string };

class RegisterPushDto {
  @IsString() @IsNotEmpty() @MaxLength(4096) token!: string;
  @IsOptional() @IsIn(['android', 'ios', 'web']) platform?: PushPlatform;
  @IsOptional() @IsString() @MaxLength(120) deviceName?: string;
  @IsOptional() @IsString() @MaxLength(40) appVersion?: string;
}

class RemovePushDto {
  @IsOptional() @IsString() @MaxLength(4096) token?: string;
}

/** Alta y baja del teléfono para avisos push (la app lo llama al iniciar y cerrar sesión). */
@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list(@Req() req: { user: AuthUser }) {
    return this.devices.listForUser(req.user.id);
  }

  @Post('push')
  @HttpCode(200)
  register(@Req() req: { user: AuthUser }, @Body() dto: RegisterPushDto) {
    return this.devices.registerFcmToken(req.user.id, dto.token, dto.platform, {
      deviceName: dto.deviceName,
      appVersion: dto.appVersion,
    });
  }

  @Delete('push')
  remove(@Req() req: { user: AuthUser }, @Body() dto: RemovePushDto) {
    return this.devices.removeFcmToken(req.user.id, dto?.token);
  }
}
