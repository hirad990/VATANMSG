import { getMessages, type VatanMessage } from './api';

/**
 * cPanel shared hosting currently uses REST polling rather than WebSockets.
 * Returns a cleanup function suitable for a React useEffect.
 */
export function subscribeToVatanMessages(
  token: string,
  conversationId: string,
  onMessages: (messages: VatanMessage[]) => void,
  onError?: (error: Error) => void,
  intervalMs = 5000
): () => void {
  let stopped = false;

  const refresh = async () => {
    try {
      const result = await getMessages(token, conversationId);
      if (!stopped) onMessages(result.messages);
    } catch (error) {
      if (!stopped && onError && error instanceof Error) onError(error);
    }
  };

  void refresh();
  const timer = setInterval(() => { void refresh(); }, Math.max(3000, intervalMs));

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
