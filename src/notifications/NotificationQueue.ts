import { Notification, NotificationResult } from './types';

export class NotificationQueue {
  private queue: Notification[] = [];
  private processing = false;
  private processingLock = Promise.resolve();
  private processedIds: Set<string> = new Set();
  private maxRetries = 3;
  private retryCountPerNotification: Map<string, number> = new Map();

  // FIX: Cache with TTL and max size to prevent memory leaks
  private resultCache: Map<string, { result: NotificationResult; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 3600000; // 1 hour
  private readonly MAX_CACHE_SIZE = 10000;

  // FIX: WeakRef or proper listener management
  private listeners: Set<(result: NotificationResult) => void> = new Set();

  constructor(private readonly processor: (notification: Notification) => Promise<boolean>) {
    // FIX: Periodic cache cleanup
    setInterval(() => this.cleanupCache(), this.CACHE_TTL_MS / 4);
  }

  addListener(callback: (result: NotificationResult) => void): () => void {
    // FIX: Use Set to prevent duplicates, return unsubscribe function
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  removeListener(callback: (result: NotificationResult) => void): void {
    this.listeners.delete(callback);
  }

  async enqueue(notification: Notification): Promise<void> {
    // FIX: Validate notification object
    if (!notification || !notification.id || !notification.userId || !notification.message) {
      throw new Error('Invalid notification: missing required fields');
    }

    // FIX: Check for duplicates before enqueueing
    if (this.processedIds.has(notification.id)) {
      return;
    }

    this.queue.push(notification);

    // FIX: Properly await queue processing
    await this.processQueue();
  }

  async enqueueBatch(notifications: Notification[]): Promise<void> {
    // FIX: Create a copy before sorting to avoid mutating input
    const sortedNotifications = [...notifications].sort((a, b) => b.priority - a.priority);

    // FIX: Mark all as pending first to prevent race conditions
    for (const notification of sortedNotifications) {
      if (!notification || !notification.id) continue;
      this.queue.push(notification);
    }

    // FIX: Single call to process the queue
    await this.processQueue();
  }

  private async processQueue(): Promise<void> {
    // FIX: Use a lock mechanism to prevent race conditions
    this.processingLock = this.processingLock.then(async () => {
      if (this.processing) {
        return;
      }
      this.processing = true;

      try {
        while (this.queue.length > 0) {
          const notification = this.queue.shift()!;

          // FIX: Check processed BEFORE processing and add immediately
          if (this.processedIds.has(notification.id)) {
            continue;
          }
          this.processedIds.add(notification.id);

          const retryCount = this.retryCountPerNotification.get(notification.id) || 0;

          try {
            const success = await this.processor(notification);

            const result: NotificationResult = {
              success,
              notificationId: notification.id,
              timestamp: new Date(),
            };

            // FIX: Cache with timestamp for TTL
            this.cacheResult(notification.id, result);

            // FIX: Notify listeners asynchronously to not block the queue
            this.notifyListenersAsync(result);

          } catch (error) {
            // FIX: Per-notification retry count
            if (retryCount < this.maxRetries) {
              this.retryCountPerNotification.set(notification.id, retryCount + 1);
              this.processedIds.delete(notification.id); // Allow reprocessing
              this.queue.push(notification); // Add to end, not front
            } else {
              // FIX: Clean up retry count after max retries
              this.retryCountPerNotification.delete(notification.id);

              const result: NotificationResult = {
                success: false,
                notificationId: notification.id,
                timestamp: new Date(),
                error: error instanceof Error ? error.message : 'Unknown error',
              };
              this.cacheResult(notification.id, result);
              this.notifyListenersAsync(result);
            }
          }
        }
      } finally {
        this.processing = false;
      }
    });

    await this.processingLock;
  }

  private cacheResult(notificationId: string, result: NotificationResult): void {
    // FIX: Enforce max cache size
    if (this.resultCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.resultCache.keys().next().value;
      if (oldestKey) {
        this.resultCache.delete(oldestKey);
      }
    }
    this.resultCache.set(notificationId, { result, timestamp: Date.now() });
  }

  private notifyListenersAsync(result: NotificationResult): void {
    // FIX: Use setImmediate/setTimeout to not block
    setTimeout(() => {
      this.listeners.forEach(listener => {
        try {
          listener(result);
        } catch (e) {
          console.error('Listener error:', e);
        }
      });
    }, 0);
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.resultCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL_MS) {
        this.resultCache.delete(key);
      }
    }
  }

  getResult(notificationId: string): NotificationResult | undefined {
    const cached = this.resultCache.get(notificationId);
    return cached?.result;
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  // FIX: Add cleanup method
  clearCache(): void {
    this.resultCache.clear();
    this.processedIds.clear();
    this.retryCountPerNotification.clear();
  }

  // FIX: Add method to clear all listeners
  clearListeners(): void {
    this.listeners.clear();
  }
}
