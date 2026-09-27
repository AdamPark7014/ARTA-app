export function pushMetaFor(type: string): {channel: 'chat'|'approvals'|'tasks'|'finance'|'events'|'general'; priority: 'high'|'normal'} {
  if (type.startsWith('chat.')) {
    return {channel: 'chat', priority: 'high'};
  } else if (type.endsWith('.review') || type === 'po.requested' || type === 'checklist.submitted') {
    return {channel: 'approvals', priority: 'high'};
  } else if (type.startsWith('task.')) {
    return {channel: 'tasks', priority: type.includes('.assigned') || type.includes('.rejected') ? 'high' : 'normal'};
  } else if (type.startsWith('po.') || type.startsWith('finance.') || type === 'campaign.paid') {
    return {channel: 'finance', priority: 'normal'};
  } else if (type.startsWith('event.')) {
    return {channel: 'events', priority: 'normal'};
  } else {
    return {channel: 'general', priority: 'normal'};
  }
}

export function shortName(fullName: string): string {
  const parts = fullName.split(' ');
  return parts[0] + ' ' + parts[1].charAt(0);
}