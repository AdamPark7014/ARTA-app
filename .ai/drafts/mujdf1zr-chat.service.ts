        this.prisma.chatMessage.findMany({ where: { AND: [base, newerThan(c)] }, include: messageInclude, orderBy: asc, take: half }),
      ]);
      return { messages: [...older, c!, ...newer], total: older.length + newer.length + 1 };
    }

    const cursor = opts.before ? await cursorOf(opts.before) : opts.after ? await cursorOf(opts.after) : null;
    const messages = await this.prisma.chatMessage.findMany({
      where: { AND: [base, cursor ? olderThan(cursor) : {}] },
      include: messageInclude,
      orderBy: desc,
      take: limit + 1,
    });
    return { messages: messages.length > limit ? messages.slice(0, -1) : messages, total: messages.length };
  }

  async postMessage(user: ChatUser, channelId: string, content: string, opts: { parentId?: string | null } = {}) {
    const { channel } = await this.access(user, channelId);
    if (!channel.kind.includes('PUBLIC')) {
      throw new ForbiddenException('No puedes enviar mensajes en este tipo de canal');
    }
    const message = await this.prisma.chatMessage.create({
      data: {
        channelId,
        authorId: user.id,
        parentId: opts.parentId,
        content: stripMarkdown(content).slice(0, MESSAGE_MAX_LENGTH),
        markdown: content.slice(0, MESSAGE_MAX_LENGTH),
      },
      include: messageInclude,
    });
    this.realtime.emitToChannel(channelId, 'chat:message-added', message);
    await this.realtime.emitToUsers(await this.channelSubscribers(channelId), 'chat:message-added', message);
    return message;
  }

  async editMessage(user: ChatUser, messageId: string, content: string) {
    const { message, channel } = await this.access(user, messageId, { write: true });
    if (!channel.kind.includes('PUBLIC')) {
      throw new ForbiddenException('No puedes editar mensajes en este tipo de canal');
    }
    if (message.authorId !== user.id && !this.canModerate(user, message.role)) {
      throw new ForbiddenException('Solo el autor o un moderador puede editar mensajes');
    }
    await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { content: stripMarkdown(content).slice(0, MESSAGE_MAX_LENGTH), markdown: content.slice(0, MESSAGE_MAX_LENGTH) },
    });
    this.realtime.emitToChannel(channel.id, 'chat:message-updated', { messageId });
    return { ok: true };
  }

  async deleteMessage(user: ChatUser, messageId: string) {
    const { message, channel } = await this.access(user, messageId, { write: true });
    if (!channel.kind.includes('PUBLIC')) {
      throw new ForbiddenException('No puedes eliminar mensajes en este tipo de canal');
    }
    if (message.authorId !== user.id && !this.canModerate(user, message.role)) {
      throw new ForbiddenException('Solo el autor o un moderador puede eliminar mensajes');
    }
    await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
    this.realtime.emitToChannel(channel.id, 'chat:message-updated', { messageId });
    return { ok: true };
  }

  // ─── Otros ────────────────────────────────────────────────────────────

  async readMessage(user: ChatUser, messageId: string) {
    const { message } = await this.access(user, messageId);
    if (message.senderId === user.id) return { ok: true }; // Ya leído por sí mismo
    const row = await this.prisma.chatChannelMember.findFirst({
      where: { channelId: message.channelId, userId: user.id },
      select: { lastReadAt: true },
    });
    if (row?.lastReadAt && row.lastReadAt > message.createdAt) return { ok: true }; // Ya leído recientemente
    await this.prisma.chatChannelMember.update({
      where: { channelId_userId: { channelId: message.channelId, userId: user.id } },
      data: { lastReadAt: new Date() },
    });
    this.realtime.emitToUser(user.id, 'chat:unread', await this.unreadTotal(user));
    return { ok: true };
  }

  async unreadTotal(user: ChatUser) {
    const orgId = tenantIdOf(user);
    const channels = await this.prisma.chatChannelMember.findMany({
      where: { userId: user.id, lastReadAt: null },
      select: { channelId: true },
    });
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        channelId: { in: channels.map((c) => c.channelId) },
        createdAt: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Últimos 30 días
        deletedAt: null,
      },
      select: { id: true, senderId: true, parentId: true, channel: { select: { slug: true } } },
    });
    const unread = messages.filter(
      (m) =>
        m.channel.slug !== GENERAL_SLUG &&
        m.channel.slug !== ANNOUNCEMENTS_SLUG &&
        m.senderId !== user.id &&
        (m.parentId ? m.id !== m.parentId : true)
    );
    return unread.length;
  }

  async systemMessage(channelId: string, user: ChatUser, content: string) {
    await this.prisma.chatMessage.create({
      data: {
        channelId,
        authorId: null,
        parentId: null,
        content,
        markdown: content,
        system: true,
      },
      include: messageInclude,
    });
    return { ok: true };
  }

  private async access(user: ChatUser, id: string, opts: { read?: boolean; write?: boolean } = {}) {
    const { role } = await this.prisma.chatChannelMember.findFirst({
      where: { channelId: id, userId: user.id },
      select: { role: true },
    });
    if (role === null) throw new ForbiddenException('No tienes acceso a este canal');
    const channel = await this.prisma.chatChannel.findUnique({ where: { id }, select: { organizationId: true, kind: true } });
    if (!channel) throw new NotFoundException('Canal no encontrado');
    const orgId = tenantIdOf(user);
    if (channel.organizationId !== orgId && channel.organizationId !== null) {
      throw new ForbiddenException('Este canal no es para tu organización');
    }
    if (opts.read && !channel.kind.includes('PUBLIC')) throw new ForbiddenException('No puedes leer en este tipo de canal');
    if (opts.write && !this.canModerate(user, role)) throw new ForbiddenException('No tienes permiso para escribir en este canal');
    return { channel, membership: { role } };
  }

  private async channelSubscribers(channelId: string) {
    const members = await this.prisma.chatChannelMember.findMany({
      where: { channelId, lastReadAt: null },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }

  private async validColleagueIds(user: ChatUser, userIds: string[]) {
    const orgId = tenantIdOf(user);
    const members = await this.prisma.user.findMany({
      where: { organizationId: orgId, id: { in: userIds } },
      select: { id: true },
    });
    return members.map((m) => m.id);
  }

  private canModerate(user: ChatUser, role: string | null) {
    return role === 'owner' || role === 'moderator';
  }
}