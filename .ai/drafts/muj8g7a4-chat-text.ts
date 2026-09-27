export function chatPreview(body: string): string {
  body = body.replace(/@\w+\(user:\d+\)/g, (match) => match.replace(/(user:\d+)/, ''));
  body = body.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  body = body.replace(/\s+/g, ' ').trim();
  return body.length > 140 ? body.slice(0, 137) + '...' : body;
}

export function mentionedUserIds(body: string, authorId: string): Set<string> {
  const ids = new Set<string>();
  const mentions = body.match(/@\w+\(user:(\d+)\)/g);
  if (mentions) {
    for (const mention of mentions) {
      const id = mention.match(/user:(\d+)/)[1];
      if (id !== authorId) {
        ids.add(id);
      }
    }
  }
  return ids;
}

export function mentionsChannel(body: string): boolean {
  return body.includes('@canal') || body.includes('@todos');
}

export function slugify(name: string): string {
  const lower = name.toLowerCase();
  const ascii = lower.replace(/[^a-z0-9]/g, '-');
  const trimmed = ascii.replace(/^-+|-+$/g, '');
  return trimmed.slice(0, 60);
}