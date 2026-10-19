export type VatanUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  birthYear?: number | null;
  birthCalendar?: 'solar_hijri' | 'gregorian' | null;
};

export type VatanConversation = {
  id: string;
  kind: 'group' | 'channel' | 'direct';
  title: string;
  description: string | null;
  channelId?: string | null;
  role?: 'owner' | 'admin' | 'member' | 'subscriber';
  avatarUrl?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
};

export type VatanMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  replyToId?: string | null;
  status?: 'sending' | 'sent' | 'failed';
  clientMessageId?: string;
  attachments?: VatanAttachment[];
  readCount?: number;
  deliveredCount?: number;
};

type AuthResponse = { token: string; user: VatanUser };

const API_BASE_URL = 'https://binercraft.ir/api';

export class VatanApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'VatanApiError';
  }
}

async function request<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers
      }
    });
  } catch {
    throw new VatanApiError('Cannot reach https://binercraft.ir/api. Check hosting/API status and network.', 0);
  }

  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new VatanApiError(payload.error || `API request failed (${response.status}).`, response.status);
  return payload as T;
}

function normalizeUser(value: any): VatanUser {
  const user = value?.user ?? value;
  return {
    id: String(user.id),
    username: String(user.username ?? ''),
    displayName: String(user.displayName ?? user.display_name ?? ''),
    avatarUrl: user.avatarUrl ?? user.avatar_url ?? null,
    birthYear: user.birthYear ?? user.birth_year ?? null,
    birthCalendar: user.birthCalendar ?? user.birth_calendar ?? null
  };
}

function normalizeConversation(value: any): VatanConversation {
  return {
    id: String(value.id),
    kind: value.kind === 'direct' || value.type === 'private' ? 'direct' : (value.kind ?? value.type ?? 'group'),
    title: String(value.title ?? ''),
    description: value.description ?? null,
    channelId: value.channelId ?? value.channel_id ?? null,
    role: value.role,
    avatarUrl: value.avatarUrl ?? value.otherUser?.avatarUrl ?? value.other_user?.avatar_url ?? null,
    lastMessage: value.lastMessage ?? value.last_message ?? null,
    lastMessageAt: value.lastMessageAt ?? value.last_message_at ?? null
  };
}

function normalizeMessage(value: any): VatanMessage {
  return {
    id: String(value.id),
    conversationId: String(value.conversationId ?? value.conversation_id),
    senderId: String(value.senderId ?? value.sender_id),
    body: String(value.body ?? ''),
    createdAt: String(value.createdAt ?? value.created_at ?? ''),
    editedAt: value.editedAt ?? value.edited_at ?? null,
    username: String(value.username ?? ''),
    displayName: String(value.displayName ?? value.display_name ?? value.sender_name ?? ''),
    avatarUrl: value.avatarUrl ?? value.avatar_url ?? null,
    replyToId: value.replyToId == null && value.reply_to_id == null ? null : String(value.replyToId ?? value.reply_to_id),
    clientMessageId: value.clientMessageId ?? value.client_message_id ?? undefined,
    attachments: Array.isArray(value.attachments) ? value.attachments : [],
    readCount: Number(value.readCount ?? 0),
    deliveredCount: Number(value.deliveredCount ?? 0)
  };
}

export async function registerAccount(profile: { username: string; displayName: string; password: string }) {
  const result = await request<any>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify(profile)
  });
  return { ...result, user: normalizeUser(result.user) } as AuthResponse;
}

export async function loginWithPassword(credentials: { username: string; password: string }) {
  const result = await request<any>('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify(credentials)
  });
  return { ...result, user: normalizeUser(result.user) } as AuthResponse;
}

export async function getMyProfile(token: string): Promise<VatanUser> {
  return normalizeUser(await request<any>('/auth/me', token));
}

export async function updateMyProfile(token: string, profile: {
  displayName?: string;
  username?: string;
  birthYear?: number | null;
  birthCalendar?: 'solar_hijri' | 'gregorian' | null;
  avatarUrl?: string | null;
}): Promise<VatanUser> {
  const result = await request<any>('/auth/profile', token, {
    method: 'PATCH',
    body: JSON.stringify(profile)
  });
  return normalizeUser(result);
}

export async function uploadProfileAvatar(
  token: string,
  file: { uri: string; name: string; type: string }
): Promise<{ avatarUrl: string }> {
  const form = new FormData();
  if (typeof window !== 'undefined') {
    const blob = await fetch(file.uri).then(response => {
      if (!response.ok) throw new Error('Could not read the selected profile photo.');
      return response.blob();
    });
    form.append('file', blob, file.name);
  } else {
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
  }
  const response = await fetch(`${API_BASE_URL}/media/avatar-upload`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: form
  });
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new VatanApiError(payload.error || `Profile photo upload failed (${response.status}).`, response.status);
  if (typeof payload.avatarUrl !== 'string' || !payload.avatarUrl.startsWith('https://')) {
    throw new VatanApiError('The server did not return a valid profile photo URL.', 500);
  }
  return { avatarUrl: payload.avatarUrl };
}

export async function logout(token: string): Promise<void> {
  await request('/auth/logout', token, { method: 'POST', body: '{}' });
}

export async function listConversations(token: string): Promise<{ conversations: VatanConversation[] }> {
  const result = await request<{ conversations: any[] }>('/conversations', token);
  return { conversations: (result.conversations ?? []).map(normalizeConversation) };
}

export async function createGroup(token: string, title: string, description?: string) {
  const result = await request<any>('/conversations', token, {
    method: 'POST',
    body: JSON.stringify({ type: 'group', title, description })
  });
  return { ...result, conversation: normalizeConversation(result.conversation) };
}

export async function createChannel(token: string, title: string, description?: string, channelId?: string) {
  const result = await request<any>('/conversations', token, {
    method: 'POST',
    body: JSON.stringify({ type: 'channel', title, description, channel_id: channelId || '' })
  });
  return { ...result, conversation: normalizeConversation(result.conversation) };
}

export async function getMessages(token: string, conversationId: string) {
  const result = await request<{ messages: any[] }>(
    `/messages?conversation_id=${encodeURIComponent(conversationId)}&limit=50`,
    token
  );
  return { messages: (result.messages ?? []).map(normalizeMessage) };
}

export async function sendMessage(token: string, conversationId: string, body: string, options: { replyToId?: string | null; clientMessageId?: string } = {}) {
  const result = await request<any>('/messages', token, {
    method: 'POST',
    body: JSON.stringify({
      conversation_id: Number(conversationId), body,
      ...(options.replyToId ? { reply_to_id: Number(options.replyToId) } : {}),
      ...(options.clientMessageId ? { client_message_id: options.clientMessageId } : {})
    })
  });
  return { ...result, message: normalizeMessage(result.message) };
}

export type VatanIdentifierResolution = {
  users: VatanUser[];
  channels: VatanConversation[];
};

export async function resolveIdentifier(token: string, query: string): Promise<VatanIdentifierResolution> {
  const result = await request<any>(`/resolve?q=${encodeURIComponent(query.replace(/^@/, ''))}`, token);
  return {
    users: (result.users ?? []).map((user: any) => ({
      id: String(user.id), username: String(user.username ?? ''),
      displayName: String(user.displayName ?? user.display_name ?? ''),
      avatarUrl: user.avatarUrl ?? user.avatar_url ?? null
    })),
    channels: (result.channels ?? []).map(normalizeConversation)
  };
}

export async function searchUsers(token: string, query: string): Promise<{ users: VatanUser[] }> {
  const result = await request<{ users: any[] }>(`/users/search?q=${encodeURIComponent(query)}`, token);
  return {
    users: (result.users ?? []).map((user) => ({
      id: String(user.id),
      username: String(user.username ?? ''),
      displayName: String(user.displayName ?? user.display_name ?? ''),
      avatarUrl: user.avatarUrl ?? user.avatar_url ?? null,
      birthYear: user.birthYear ?? null,
      birthCalendar: user.birthCalendar ?? null
    }))
  };
}

export async function createDirectConversation(token: string, username: string) {
  const result = await request<any>('/conversations/direct', token, {
    method: 'POST',
    body: JSON.stringify({ username })
  });
  return { ...result, conversation: normalizeConversation(result.conversation) };
}

export async function joinConversation(token: string, conversationId: string): Promise<void> {
  await request('/conversations/join', token, {
    method: 'POST',
    body: JSON.stringify({ conversation_id: Number(conversationId) })
  });
}

export async function leaveConversation(token: string, conversationId: string): Promise<void> {
  await request('/conversations/leave', token, {
    method: 'POST',
    body: JSON.stringify({ conversation_id: Number(conversationId) })
  });
}

export async function deleteConversation(token: string, conversationId: string): Promise<void> {
  await request('/conversations/delete', token, {
    method: 'DELETE',
    body: JSON.stringify({ conversation_id: Number(conversationId) })
  });
}

export async function addConversationMember(token: string, conversationId: string, username: string): Promise<void> {
  await request('/conversations/add-member', token, {
    method: 'POST',
    body: JSON.stringify({ conversation_id: Number(conversationId), username })
  });
}

export async function editMessage(token: string, messageId: string, body: string) {
  const result = await request<any>('/messages/edit', token, {
    method: 'PATCH',
    body: JSON.stringify({ message_id: Number(messageId), body })
  });
  return { ...result, message: normalizeMessage(result.message) };
}

export async function deleteMessage(token: string, messageId: string): Promise<void> {
  await request('/messages/delete', token, {
    method: 'POST',
    body: JSON.stringify({ message_id: Number(messageId) })
  });
}



export type VatanGroupSettings = {
  id: string;
  title: string;
  description: string | null;
  channelId?: string | null;
  avatarUrl: string | null;
  themeKey: string;
  themeMode: 'light' | 'dark' | 'system';
  memberCanSend: boolean;
  memberCanInvite: boolean;
  memberCanPin: boolean;
  slowModeSeconds: number;
  showSignatures: boolean;
};

export type VatanMember = VatanUser & { role: 'owner' | 'admin' | 'member' | 'subscriber' };

export async function getConversationMembers(token: string, conversationId: string): Promise<{ members: VatanMember[] }> {
  const result = await request<{ members: any[] }>(`/conversations/members?id=${encodeURIComponent(conversationId)}`, token);
  return { members: (result.members ?? []).map(member => ({
    id: String(member.id), username: String(member.username ?? ''),
    displayName: String(member.displayName ?? member.display_name ?? ''),
    avatarUrl: member.avatarUrl ?? member.avatar_url ?? null,
    role: member.role
  })) };
}

export async function getConversationSettings(token: string, conversationId: string): Promise<VatanGroupSettings> {
  const result = await request<{ settings: VatanGroupSettings }>(`/conversations/manage?id=${encodeURIComponent(conversationId)}`, token);
  return result.settings;
}

export async function updateConversationSettings(token: string, conversationId: string, settings: Partial<Omit<VatanGroupSettings, 'id'>>): Promise<VatanGroupSettings> {
  const result = await request<{ settings: any }>('/conversations/manage', token, {
    method: 'PATCH',
    body: JSON.stringify({ conversation_id: Number(conversationId), ...settings })
  });
  return result.settings as VatanGroupSettings;
}

export async function removeConversationMember(token: string, conversationId: string, userId: string): Promise<void> {
  await request('/conversations/remove-member', token, { method: 'POST', body: JSON.stringify({ conversation_id: Number(conversationId), user_id: Number(userId) }) });
}

export async function setConversationMemberRole(token: string, conversationId: string, userId: string, role: 'admin' | 'member'): Promise<void> {
  await request('/conversations/member-role', token, { method: 'PATCH', body: JSON.stringify({ conversation_id: Number(conversationId), user_id: Number(userId), role }) });
}

export async function transferConversationOwnership(token: string, conversationId: string, userId: string): Promise<void> {
  await request('/conversations/transfer-ownership', token, { method: 'POST', body: JSON.stringify({ conversation_id: Number(conversationId), user_id: Number(userId) }) });
}

export async function toggleMessageReaction(token: string, messageId: string, reaction: string) {
  return request<{ success: boolean; active: boolean; reactions: { reaction: string; count: number }[] }>('/messages/react', token, {
    method: 'POST', body: JSON.stringify({ message_id: Number(messageId), reaction })
  });
}

export async function markMessagesRead(token: string, conversationId: string, lastMessageId: string): Promise<void> {
  await request('/messages/read', token, {
    method: 'POST', body: JSON.stringify({ conversation_id: Number(conversationId), last_message_id: Number(lastMessageId) })
  });
}

export type VatanPrivacySettings = { phone: 'everyone' | 'contacts' | 'nobody'; profile: 'everyone' | 'contacts' | 'nobody'; lastSeen: 'everyone' | 'contacts' | 'nobody'; invites: 'everyone' | 'contacts' | 'nobody' };
export type VatanSession = { id: string; ipAddress: string | null; userAgent: string | null; createdAt: string; lastSeenAt: string; expiresAt: string; isCurrent: boolean; location: string | null };

export async function getPrivacySettings(token: string): Promise<VatanPrivacySettings> {
  const result = await request<{ settings: VatanPrivacySettings }>('/auth/privacy', token);
  return result.settings;
}

export async function updatePrivacySettings(token: string, settings: VatanPrivacySettings): Promise<VatanPrivacySettings> {
  const result = await request<{ settings: VatanPrivacySettings }>('/auth/privacy', token, { method: 'PATCH', body: JSON.stringify(settings) });
  return result.settings;
}

export async function listActiveSessions(token: string): Promise<VatanSession[]> {
  const result = await request<{ sessions: VatanSession[] }>('/auth/sessions', token);
  return result.sessions ?? [];
}

export async function deleteAccount(token: string, password: string): Promise<void> {
  await request('/auth/delete-account', token, { method: 'POST', body: JSON.stringify({ password }) });
}

export async function logoutAllSessions(token: string): Promise<void> {
  await request('/auth/logout-all', token, { method: 'POST', body: '{}' });
}

export async function searchConversationMessages(token: string, conversationId: string, query: string): Promise<{ messages: VatanMessage[] }> {
  const result = await request<{ messages: any[] }>(
    `/messages/search?conversation_id=${encodeURIComponent(conversationId)}&q=${encodeURIComponent(query)}`,
    token
  );
  return { messages: (result.messages ?? []).map(normalizeMessage) };
}


export type VatanAttachment = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt?: string;
};

export async function uploadConversationAttachment(
  token: string,
  conversationId: string,
  file: { uri: string; name: string; type: string }
): Promise<{ message: VatanMessage; attachment: VatanAttachment }> {
  const form = new FormData();
  form.append('conversation_id', conversationId);
  if (typeof window !== 'undefined') {
    const blob = await fetch(file.uri).then(response => {
      if (!response.ok) throw new Error('Could not read the selected file.');
      return response.blob();
    });
    form.append('file', blob, file.name);
  } else {
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
  }
  const response = await fetch(`${API_BASE_URL}/media/upload`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: form
  });
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new VatanApiError(payload.error || `Upload failed (${response.status}).`, response.status);
  return { message: normalizeMessage(payload.message), attachment: payload.attachment as VatanAttachment };
}

export async function registerPushDevice(token: string, pushToken: string, platform: 'ios' | 'android' | 'web'): Promise<void> {
  await request('/push/register', token, {
    method: 'POST',
    body: JSON.stringify({ push_token: pushToken, platform })
  });
}
