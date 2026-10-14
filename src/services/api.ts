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

const API_BASE_URL = (process.env.EXPO_PUBLIC_VATAN_API_URL || 'http://localhost:4000').replace(/\/$/, '');

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
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers
      }
    });
  } catch {
    throw new VatanApiError('Cannot reach Vatan server. Check the API URL and network.', 0);
  }

  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new VatanApiError(payload.error || 'Request failed.', response.status);
  return payload as T;
}

/** Development-only login. The server must reject this endpoint in production. */
export function loginDemo(profile: { username?: string; displayName?: string } = {}) {
  return request<AuthResponse>('/api/auth/demo', undefined, {
    method: 'POST',
    body: JSON.stringify(profile)
  });
}

export function getMyProfile(token: string) {
  return request<VatanUser>('/api/me', token);
}

export function updateMyProfile(token: string, profile: {
  displayName?: string;
  username?: string;
  birthYear?: number | null;
  birthCalendar?: 'solar_hijri' | 'gregorian' | null;
  avatarUrl?: string | null;
}) {
  return request<VatanUser>('/api/me', token, {
    method: 'PATCH',
    body: JSON.stringify(profile)
  });
}

export async function listConversations(token: string) {
  return request<{ conversations: VatanConversation[] }>('/api/conversations', token);
}

export async function createGroup(token: string, title: string, description?: string) {
  return request<{ conversation: VatanConversation }>('/api/groups', token, {
    method: 'POST',
    body: JSON.stringify({ title, description })
  });
}

export async function createChannel(token: string, title: string, description?: string) {
  return request<{ conversation: VatanConversation }>('/api/channels', token, {
    method: 'POST',
    body: JSON.stringify({ title, description })
  });
}

export async function getMessages(token: string, conversationId: string) {
  return request<{ messages: VatanMessage[] }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    token
  );
}
