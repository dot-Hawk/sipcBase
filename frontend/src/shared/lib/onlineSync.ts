import { onlineManager } from '@tanstack/react-query';

/**
 * TanStack Query only learns about connectivity from `online`/`offline` events, so a page that
 * cold-starts offline would believe it is online, fire doomed requests, retry, and end in an
 * error state. Seed it from `navigator.onLine`; paused queries then keep their cached data.
 */
export function syncOnlineManager(): void {
  onlineManager.setOnline(navigator.onLine);
}
