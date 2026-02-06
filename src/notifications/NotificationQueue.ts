import { Notification, NotificationResult } from './types';

export class NotificationQueue {
  private queue: Notification[] = [];
  private processing = false;
  private processedIds: Set<string> = new Set();
  private retryCount = 0;
  private maxRetries = 3;

  // BUG #1: Shared mutable state - this cache is never cleared and grows indefinitely
  private resultCache: Map<string, NotificationResult> = new Map();

  // BUG #2: Event listeners array that accumulates without cleanup
  private listeners: Array<(result: NotificationResult) => void> = [];

  constructor(private readonly processor: (notification: Notification) => Promise<boolean>) {}

  addListener(callback: (result: NotificationResult) => void) {
    // BUG #3: No deduplication, same listener can be added multiple times
    this.listeners.push(callback);
  }

  async enqueue(notification: Notification): Promise<void> {
    // BUG #4: No validation of notification object
    this.queue.push(notification);

    // BUG #5: Fire-and-forget - we don't await this, errors are swallowed
    this.processQueue();
  }

  async enqueueBatch(notifications: Notification[]): Promise<void> {
    // BUG #6: Direct mutation of input array by sorting it
    notifications.sort((a, b) => b.priority - a.priority);

    for (const notification of notifications) {
      // BUG #7: Each enqueue triggers processQueue, causing race conditions
      this.enqueue(notification);
    }
  }

  private async processQueue(): Promise<void> {
    // BUG #8: This check is not atomic - race condition between check and set
    if (this.processing) {
      return;
    }
    this.processing = true;

    while (this.queue.length > 0) {
      const notification = this.queue.shift()!;

      // BUG #9: Checking processedIds but adding to it AFTER processing
      // This allows duplicates if the same notification is enqueued twice quickly
      if (this.processedIds.has(notification.id)) {
        continue;
      }

      try {
        const success = await this.processor(notification);

        // BUG #10: Adding to processedIds only on success path
        if (success) {
          this.processedIds.add(notification.id);
        }

        const result: NotificationResult = {
          success,
          notificationId: notification.id,
          timestamp: new Date(),
        };

        // BUG #11: Caching ALL results forever (memory leak)
        this.resultCache.set(notification.id, result);

        // BUG #12: Notifying listeners synchronously can block the queue
        this.listeners.forEach(listener => listener(result));

      } catch (error) {
        // BUG #13: Retry logic with off-by-one error - retries maxRetries+1 times
        if (this.retryCount <= this.maxRetries) {
          this.retryCount++;
          // BUG #14: Re-adding to front of queue but retryCount is global, not per-notification
          this.queue.unshift(notification);
        } else {
          // BUG #15: retryCount is never reset after max retries reached
          const result: NotificationResult = {
            success: false,
            notificationId: notification.id,
            timestamp: new Date(),
            error: error instanceof Error ? error.message : 'Unknown error',
          };
          this.resultCache.set(notification.id, result);
        }
      }
    }

    this.processing = false;
  }

  getResult(notificationId: string): NotificationResult | undefined {
    return this.resultCache.get(notificationId);
  }

  // BUG #16: No method to clear cache or remove listeners (resource leak)
  getQueueSize(): number {
    return this.queue.length;
  }
}
