import { Notification, NotificationResult } from './types';

export class NotificationQueue {
  private queue: Notification[] = [];
  private processing = false;
  private processingLock = Promise.resolve();
  private processedIds: Set<string> = new Set();
  private readonly maxRetries = 3;
  private retryCountPerNotification: Map<string, number> = new Map();
  private resultCache: Map<string, { result: NotificationResult; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 3600000;
  private readonly MAX_CACHE_SIZE = 10000;
  private listeners: Set<(result: NotificationResult) => void> = new Set();

  constructor(private readonly processor: (notification: Notification) => Promise<boolean>) {
    setInterval(() => this.cleanupCache(), this.CACHE_TTL_MS / 4);
  }

  addListener(callback: (result: NotificationResult) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  removeListener(callback: (result: NotificationResult) => void): void {
    this.listeners.delete(callback);
  }

  async enqueue(notification: Notification): Promise<void> {
    if (!notification || !notification.id || !notification.userId || !notification.message) {
      throw new Error('Invalid notification: missing required fields');
    }

    if (this.processedIds.has(notification.id)) {
      return;
    }

    this.queue.push(notification);
    await this.processQueue();
  }

  async enqueueBatch(notifications: Notification[]): Promise<void> {
    const sortedNotifications = [...notifications].sort((a, b) => b.priority - a.priority);

    for (const notification of sortedNotifications) {
      if (!notification || !notification.id) continue;
      this.queue.push(notification);
    }

    await this.processQueue();
  }

  private async processQueue(): Promise<void> {
    this.processingLock = this.processingLock.then(async () => {
      if (this.processing) {
        return;
      }
      this.processing = true;

      try {
        while (this.queue.length > 0) {
          const notification = this.queue.shift()!;

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

            this.cacheResult(notification.id, result);
            this.notifyListenersAsync(result);

          } catch (error) {
            if (retryCount < this.maxRetries) {
              this.retryCountPerNotification.set(notification.id, retryCount + 1);
              this.processedIds.delete(notification.id);
              this.queue.push(notification);
            } else {
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
    if (this.resultCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.resultCache.keys().next().value;
      if (oldestKey) {
        this.resultCache.delete(oldestKey);
      }
    }
    this.resultCache.set(notificationId, { result, timestamp: Date.now() });
  }

  private notifyListenersAsync(result: NotificationResult): void {
    setTimeout(() => {
      this.listeners.forEach(listener => {
        try {
          listener(result);
        } catch (error) {
          // Silent error handling to prevent listener errors from breaking the queue
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

  clearCache(): void {
    this.resultCache.clear();
    this.processedIds.clear();
    this.retryCountPerNotification.clear();
  }

  clearListeners(): void {
    this.listeners.clear();
  }
}
