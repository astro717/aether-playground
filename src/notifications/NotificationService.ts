import { User, Notification, NotificationResult, EmailProvider } from './types';
import { NotificationQueue } from './NotificationQueue';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class NotificationService {
  private readonly queue: NotificationQueue;
  private readonly userCache: Map<string, { user: User | null; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 300000;

  constructor(
    private readonly emailProvider: EmailProvider,
    private readonly userRepository: { findById(id: string): Promise<User | null> }
  ) {
    this.queue = new NotificationQueue(
      async (notification: Notification) => this.processNotification(notification)
    );
  }

  async sendAlert(userId: string, message: string, type: Notification['type'] = 'alert'): Promise<boolean> {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      return false;
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return false;
    }

    const user = await this.getUser(userId);

    if (user === null || user === undefined) {
      return false;
    }

    if (!user.preferences) {
      return false;
    }

    if (!user.preferences.notificationsEnabled) {
      return false;
    }

    if (!user.email || !EMAIL_REGEX.test(user.email)) {
      return false;
    }

    const notificationId = this.generateId();
    const notification: Notification = {
      id: notificationId,
      userId: user.id,
      message: message.trim(),
      type,
      priority: this.calculatePriority(type),
      createdAt: new Date(),
    };

    try {
      await this.queue.enqueue(notification);

      const result = this.queue.getResult(notificationId);
      if (result) {
        return result.success;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  async sendBulkAlerts(userIds: string[], message: string): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return results;
    }

    const BATCH_SIZE = 10;
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (userId) => {
        const success = await this.sendAlert(userId, message);
        return { userId, success };
      });

      const batchResults = await Promise.all(batchPromises);
      for (const { userId, success } of batchResults) {
        results.set(userId, success);
      }
    }

    return results;
  }

  async sendCriticalAlert(user: User, message: string): Promise<NotificationResult> {
    const notificationId = this.generateId();

    if (!user || !user.id || !user.email) {
      return {
        success: false,
        notificationId,
        timestamp: new Date(),
        error: 'Invalid user object provided',
      };
    }

    if (!EMAIL_REGEX.test(user.email)) {
      return {
        success: false,
        notificationId,
        timestamp: new Date(),
        error: 'Invalid email address',
      };
    }

    try {
      const sent = await this.emailProvider.send(
        user.email,
        'CRITICAL ALERT',
        message
      );

      if (sent) {
        return {
          success: true,
          notificationId,
          timestamp: new Date(),
        };
      } else {
        return {
          success: false,
          notificationId,
          timestamp: new Date(),
          error: 'Email provider returned false',
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        notificationId,
        timestamp: new Date(),
        error: errorMessage,
      };
    }
  }

  private async getUser(userId: string): Promise<User | null> {
    const cached = this.userCache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.user;
    }

    const user = await this.userRepository.findById(userId);

    if (user !== null) {
      this.userCache.set(userId, { user, timestamp: Date.now() });
    } else {
      this.userCache.delete(userId);
    }

    return user;
  }

  private async processNotification(notification: Notification): Promise<boolean> {
    const user = await this.getUser(notification.userId);

    if (user === null || user === undefined) {
      return false;
    }

    if (!user.email || !EMAIL_REGEX.test(user.email)) {
      return false;
    }

    const subject = notification.type === 'critical'
      ? 'URGENT: ' + notification.message
      : notification.type === 'warning'
        ? 'Warning: ' + notification.message
        : notification.message;

    try {
      const result = await this.emailProvider.send(user.email, subject, notification.message);
      return result;
    } catch (error) {
      throw error;
    }
  }

  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private calculatePriority(type: Notification['type']): number {
    const priorities: Record<Notification['type'], number> = {
      critical: 10,
      alert: 5,
      warning: 3,
      info: 1,
    };
    return priorities[type];
  }

  clearUserCache(): void {
    this.userCache.clear();
  }

  getQueueStatus(): { queueSize: number } {
    return {
      queueSize: this.queue.getQueueSize(),
    };
  }
}
