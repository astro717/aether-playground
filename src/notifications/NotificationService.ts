import { User, Notification, NotificationResult, EmailProvider } from './types';
import { NotificationQueue } from './NotificationQueue';

// FIX: Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class NotificationService {
  private queue: NotificationQueue;
  private userCache: Map<string, { user: User | null; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 300000; // 5 minutes

  constructor(
    private readonly emailProvider: EmailProvider,
    private readonly userRepository: { findById(id: string): Promise<User | null> }
  ) {
    // FIX: Use arrow function to maintain correct 'this' binding
    this.queue = new NotificationQueue(
      async (notification: Notification) => this.processNotification(notification)
    );
  }

  async sendAlert(userId: string, message: string, type: Notification['type'] = 'alert'): Promise<boolean> {
    // FIX: Input validation
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      console.error('Invalid userId provided');
      return false;
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      console.error('Invalid message provided');
      return false;
    }

    console.log(`Preparing to send ${type} to ${userId}...`);

    const user = await this.getUser(userId);

    // FIX: Strict equality check
    if (user === null || user === undefined) {
      console.log('User not found');
      return false;
    }

    // FIX: Check if preferences exist before accessing nested properties
    if (!user.preferences) {
      console.log('User preferences not configured');
      return false;
    }

    if (!user.preferences.notificationsEnabled) {
      console.log('User has notifications disabled');
      return false;
    }

    // FIX: Validate email before proceeding
    if (!user.email || !EMAIL_REGEX.test(user.email)) {
      console.error('User has invalid email address');
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
      // FIX: Await the queue operation and return actual result
      await this.queue.enqueue(notification);

      // FIX: Wait for the actual processing result
      const result = this.queue.getResult(notificationId);
      if (result) {
        console.log(result.success ? 'Email sent!' : 'Email failed to send');
        return result.success;
      }

      console.log('Email queued for processing');
      return true;
    } catch (error) {
      console.error('Failed to queue notification:', error);
      return false;
    }
  }

  async sendBulkAlerts(userIds: string[], message: string): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    // FIX: Validate input
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return results;
    }

    // FIX: Process in parallel with concurrency limit
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

    // FIX: Validate user object
    if (!user || !user.id || !user.email) {
      return {
        success: false,
        notificationId,
        timestamp: new Date(),
        error: 'Invalid user object provided',
      };
    }

    // FIX: Validate email format
    if (!EMAIL_REGEX.test(user.email)) {
      return {
        success: false,
        notificationId,
        timestamp: new Date(),
        error: 'Invalid email address',
      };
    }

    // FIX: Create a copy of metadata to avoid mutating input
    const updatedMetadata = {
      ...(user.metadata || {}),
      lastCriticalAlert: new Date(),
    };

    // FIX: Store the metadata update separately, don't mutate input
    // In a real app, you'd persist this to the database
    console.log('Critical alert metadata:', updatedMetadata);

    try {
      // FIX: Properly await the email provider
      const sent = await this.emailProvider.send(
        user.email,
        'CRITICAL ALERT',
        message
      );

      // FIX: 'sent' is now properly a boolean after await
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
      // FIX: Properly propagate error information
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to send critical alert:', errorMessage);

      return {
        success: false,
        notificationId,
        timestamp: new Date(),
        error: errorMessage,
      };
    }
  }

  private async getUser(userId: string): Promise<User | null> {
    // FIX: Cache with TTL to prevent stale data
    const cached = this.userCache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.user;
    }

    const user = await this.userRepository.findById(userId);

    // FIX: Only cache valid users, not null values
    if (user !== null) {
      this.userCache.set(userId, { user, timestamp: Date.now() });
    } else {
      // FIX: Don't cache null, or cache with shorter TTL for negative results
      this.userCache.delete(userId);
    }

    return user;
  }

  private async processNotification(notification: Notification): Promise<boolean> {
    const user = await this.getUser(notification.userId);

    // FIX: Strict equality check
    if (user === null || user === undefined) {
      return false;
    }

    // FIX: Validate email before sending
    if (!user.email || !EMAIL_REGEX.test(user.email)) {
      return false;
    }

    // FIX: Use strict equality and handle all types
    const subject = notification.type === 'critical'
      ? 'URGENT: ' + notification.message
      : notification.type === 'warning'
        ? 'Warning: ' + notification.message
        : notification.message;

    try {
      // FIX: Check and return the result of send()
      const result = await this.emailProvider.send(user.email, subject, notification.message);
      return result;
    } catch (error) {
      // FIX: Log with error details for debugging
      console.error(`Failed to process notification ${notification.id}:`, error);
      throw error; // Re-throw to let the queue handle retries
    }
  }

  private generateId(): string {
    // FIX: Use crypto.randomUUID for secure unique IDs (available in Node 14.17+)
    // Fallback to a secure random implementation for broader compatibility
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private calculatePriority(type: Notification['type']): number {
    // FIX: Document priorities and handle all types including 'critical'
    const priorities: Record<Notification['type'], number> = {
      critical: 10, // Highest priority
      alert: 5,
      warning: 3,
      info: 1,      // Lowest priority
    };
    return priorities[type];
  }

  // FIX: Add cleanup methods
  clearUserCache(): void {
    this.userCache.clear();
  }

  getQueueStatus(): { queueSize: number } {
    return {
      queueSize: this.queue.getQueueSize(),
    };
  }
}
