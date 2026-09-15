import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService, type ChatUser } from './chat.service';

type AuthUser = ChatUser & {
  entities: string[];
  permissions: string[];
};

class SendMessageDto {
  @IsString() thread!: string;
  @IsString() body!: string;
}

class ReadThreadDto {
  @IsString() thread!: string;
}

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chat: ChatService) {}

  /** General + una conversación por persona activa de la organización. */
  @Get('threads')
  threads(@Req() req: { user: AuthUser }) {
    return this.chat.threads(req.user);
  }

  /** Últimos 200 (ascendente) o, con `after`, solo los más nuevos. */
  @Get('messages')
  messages(
    @Req() req: { user: AuthUser },
    @Query('thread') thread: string,
    @Query('after') after?: string,
  ) {
    return this.chat.messages(req.user, thread, after);
  }

  @Post('messages')
  send(@Req() req: { user: AuthUser }, @Body() dto: SendMessageDto) {
    return this.chat.send(req.user, dto.thread, dto.body);
  }

  @Post('read')
  @HttpCode(200)
  read(@Req() req: { user: AuthUser }, @Body() dto: ReadThreadDto) {
    return this.chat.markRead(req.user, dto.thread);
  }

  @Get('unread')
  unread(@Req() req: { user: AuthUser }) {
    return this.chat.unreadTotal(req.user);
  }
}
