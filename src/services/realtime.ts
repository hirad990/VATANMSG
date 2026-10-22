import { getMessages, type VatanMessage } from './api';

/**
 * REST polling for cPanel shared hosting.
 *
 * A recursive timeout is intentional: setInterval can launch overlapping
 * requests when the server is slow, causing stale responses to overwrite
 * newer messages. This loop schedules the next poll only after the current
 * request settles and backs off during network/API failures.
 */
export function subscribeToVatanMessages(
  token: string,
  conversationId: string,
  onMessages: (messages: VatanMessage[]) => void,
  onError?: (error: Error) => void,
  intervalMs = 5000
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let consecutiveFailures = 0;
  const baseDelay = Math.max(3000, intervalMs);
  const maxDelay = 30000;

  const schedule = (delay: number) => {
    if (stopped) return;
    timer = setTimeout(() => {
      void refresh();
    }, delay);
  };

  const refresh = async () => {
    if (stopped) return;
    let nextDelay = baseDelay;
    try {
      const result = await getMessages(token, conversationId);
      if (stopped) return;
      consecutiveFailures = 0;
      onMessages(result.messages);
    } catch (error) {
      if (stopped) return;
      consecutiveFailures += 1;
      if (onError && error instanceof Error) onError(error);
      nextDelay = Math.min(maxDelay, baseDelay * 2 ** Math.min(consecutiveFailures, 3));
    } finally {
      schedule(nextDelay);
    }
  };

  void refresh();

  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
