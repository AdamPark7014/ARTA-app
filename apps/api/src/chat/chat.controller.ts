import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { contentMatchesExtension, discardUpload, MULTER_OPTIONS } from '../uploads/upload-storage';
import { CHAT_ATTACHMENT_EXT, ChatService, MAX_BODY, type ChatUser } from './chat.service';

type AuthUser = ChatUser & { entities: string[]; permissions: string[] };
type Req_ = { user: AuthUser };

class LegacySendDto {
  @IsString() thread!: string;
  @IsString() body!: string;
}

class LegacyReadDto {
  @IsString() thread!: string;
}

class CreateChannelDto {
  @IsString() @MaxLength(80) name!: string;
  @IsOptional() @IsIn(['PUBLIC', 'PRIVATE']) kind?: 'PUBLIC' | 'PRIVATE';
  @IsOptional() @IsString() @MaxLength(250) topic?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) memberIds?: string[];
}

class UpdateChannelDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(250) topic?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

class MembersDto {
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) userIds!: string[];
}

class MuteDto {
  @IsBoolean() muted!: boolean;
  /** Vacío = siempre. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) hours?: number;
}

class DirectDto {
  @IsString() userId!: string;
}

class PostMessageDto {
  @IsOptional() @IsString() @MaxLength(MAX_BODY) body?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsString() @MaxLength(300) attachmentUrl?: string;
  @IsOptional() @IsString() @MaxLength(200) attachmentName?: string;
  @IsOptional() @IsString() @MaxLength(100) attachmentMime?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) attachmentSize?: number;
  @IsOptional() @IsString() @MaxLength(64) clientId?: string;
}

class EditMessageDto {
  @IsString() @MaxLength(MAX_BODY) body!: string;
}

class ReactionDto {
  @IsString() @MaxLength(32) emoji!: string;
}

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  // ─── Canales ─────────────────────────────────────────────────────────────

  @Get('channels')
  channels(@Req() req: Req_) {
    return this.chat.listChannels(req.user);
  }

  @Post('channels')
  createChannel(@Req() req: Req_, @Body() dto: CreateChannelDto) {
    return this.chat.createChannel(req.user, dto);
  }

  @Get('channels/:id')
  channel(@Req() req: Req_, @Param('id') id: string) {
    return this.chat.getChannel(req.user, id);
  }

  @Patch('channels/:id')
  updateChannel(@Req() req: Req_, @Param('id') id: string, @Body() dto: UpdateChannelDto) {
    return this.chat.updateChannel(req.user, id, dto);
  }

  @Post('channels/:id/archive')
  @HttpCode(200)
  archive(@Req() req: Req_, @Param('id') id: string) {
    return this.chat.archiveChannel(req.user, id);
  }

  @Post('channels/:id/members')
  addMembers(@Req() req: Req_, @Param('id') id: string, @Body() dto: MembersDto) {
    return this.chat.addMembers(req.user, id, dto.userIds);
  }

  @Delete('channels/:id/members/:userId')
  removeMember(@Req() req: Req_, @Param('id') id: string, @Param('userId') userId: string) {
    return this.chat.removeMember(req.user, id, userId);
  }

  @Post('channels/:id/leave')
  @HttpCode(200)
  leave(@Req() req: Req_, @Param('id') id: string) {
    return this.chat.removeMember(req.user, id, req.user.id);
  }

  @Patch('channels/:id/mute')
  mute(@Req() req: Req_, @Param('id') id: string, @Body() dto: MuteDto) {
    return this.chat.setMuted(req.user, id, dto.muted, dto.hours);
  }

  @Post('channels/:id/read')
  @HttpCode(200)
  markRead(@Req() req: Req_, @Param('id') id: string) {
    return this.chat.markRead(req.user, id);
  }

  @Get('channels/:id/pins')
  pins(@Req() req: Req_, @Param('id') id: string) {
    return this.chat.listPins(req.user, id);
  }

  @Post('dm')
  @HttpCode(200)
  openDirect(@Req() req: Req_, @Body() dto: DirectDto) {
    return this.chat.openDirect(req.user, dto.userId);
  }

  @Post('event/:eventId')
  @HttpCode(200)
  openEvent(@Req() req: Req_, @Param('eventId') eventId: string) {
    return this.chat.openEventChannel(req.user, eventId);
  }

  // ─── Mensajes ────────────────────────────────────────────────────────────

  @Get('channels/:id/messages')
  messagesOf(
    @Req() req: Req_,
    @Param('id') id: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
    @Query('around') around?: string,
    @Query('limit') limit?: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.chat.listMessages(req.user, id, {
      before: before || undefined,
      after: after || undefined,
      around: around || undefined,
      limit: limit ? Number(limit) : undefined,
      parentId: parentId || null,
    });
  }

  @Post('channels/:id/messages')
  post(@Req() req: Req_, @Param('id') id: string, @Body() dto: PostMessageDto) {
    return this.chat.postMessage(req.user, id, dto);
  }

  @Get('messages/:id/thread')
  thread(@Req() req: Req_, @Param('id') id: string) {
    return this.chat.getThread(req.user, id);
  }

  @Patch('messages/:id')
  edit(@Req() req: Req_, @Param('id') id: string, @Body() dto: EditMessageDto) {
    return this.chat.editMessage(req.user, id, dto.body);
  }

  @Delete('messages/:id')
  remove(@Req() req: Req_, @Param('id') id: string) {
    return this.chat.deleteMessage(req.user, id);
  }

  @Post('messages/:id/reactions')
  @HttpCode(200)
  react(@Req() req: Req_, @Param('id') id: string, @Body() dto: ReactionDto) {
    return this.chat.toggleReaction(req.user, id, dto.emoji);
  }

  @Post('messages/:id/pin')
  @HttpCode(200)
  pin(@Req() req: Req_, @Param('id') id: string) {
    return this.chat.togglePin(req.user, id);
  }

  @Get('search')
  search(@Req() req: Req_, @Query('q') q?: string, @Query('channelId') channelId?: string) {
    return this.chat.searchMessages(req.user, q ?? '', channelId || undefined);
  }

  @Get('colleagues')
  colleagues(@Req() req: Req_, @Query('q') q?: string) {
    return this.chat.listColleagues(req.user, q);
  }

  /** Foto o PDF para adjuntar; devuelve lo que luego va en `POST …/messages`. */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', MULTER_OPTIONS))
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo requerido');
    const ext = extname(file.originalname).toLowerCase();
    if (!CHAT_ATTACHMENT_EXT.has(ext) || !contentMatchesExtension(file.path, file.originalname)) {
      discardUpload(file.path);
      throw new BadRequestException('En el chat se comparten fotos y PDF');
    }
    return {
      url: `/uploads/${file.filename}`,
      name: file.originalname.slice(0, 200),
      mime: file.mimetype,
      size: file.size,
    };
  }

  @Get('unread')
  unread(@Req() req: Req_) {
    return this.chat.unreadTotal(req.user);
  }

  // ─── Compatibilidad con la web actual (hilos «general» / «dm:<id>») ───────

  @Get('threads')
  threads(@Req() req: Req_) {
    return this.chat.legacyThreads(req.user);
  }

  @Get('messages')
  messages(@Req() req: Req_, @Query('thread') thread: string, @Query('after') after?: string) {
    return this.chat.legacyMessages(req.user, thread, after);
  }

  @Post('messages')
  send(@Req() req: Req_, @Body() dto: LegacySendDto) {
    return this.chat.legacySend(req.user, dto.thread, dto.body);
  }

  @Post('read')
  @HttpCode(200)
  read(@Req() req: Req_, @Body() dto: LegacyReadDto) {
    return this.chat.legacyMarkRead(req.user, dto.thread);
  }
}
