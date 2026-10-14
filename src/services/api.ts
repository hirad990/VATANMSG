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
  role?: 'owner' | 'admin' | 'member' | 'subscriber';
  lastMessage?: string | null;
  lastMessageAt?: string | null;
};

export type VatanMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  username: string;
  displayName: string;
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
    role: value.role,
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
    username: String(value.username ?? ''),
    displayName: String(value.displayName ?? value.display_name ?? value.sender_name ?? '')
  };
}

/** Development-only sign-in. This does not verify a phone number. */
export async function loginDemo(profile: { username: string; displayName: string }) {
  const result = await request<any>('/auth/demo', undefined, {
    method: 'POST',
    body: JSON.stringify(profile)
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

export async function createChannel(token: string, title: string, description?: string) {
  const result = await request<any>('/conversations', token, {
    method: 'POST',
    body: JSON.stringify({ type: 'channel', title, description })
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

export async function sendMessage(token: string, conversationId: string, body: string) {
  const result = await request<any>('/messages', token, {
    method: 'POST',
    body: JSON.stringify({ conversation_id: Number(conversationId), body })
  });
  return { ...result, message: normalizeMessage(result.message) };
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

