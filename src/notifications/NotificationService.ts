import { User, Notification, NotificationResult, EmailProvider } from './types';
import { NotificationQueue } from './NotificationQueue';

export class NotificationService {
  private queue: NotificationQueue;
  private userCache: Map<string, User> = new Map();

  // BUG #1: Storing sensitive data in a class property that could be logged
  private lastSentEmails: string[] = [];

  constructor(
    private readonly emailProvider: EmailProvider,
    private readonly userRepository: { findById(id: string): Promise<User | null> }
  ) {
    // BUG #2: Binding 'this' incorrectly - arrow function needed but using regular bind
    this.queue = new NotificationQueue(this.processNotification.bind(this));
  }

  async sendAlert(userId: string, message: string, type: Notification['type'] = 'alert'): Promise<boolean> {
    console.log(`Preparing to send ${type} to ${userId}...`);

    // BUG #3: No input validation - empty userId or message passes through
    const user = await this.getUser(userId);

    // BUG #4: Loose equality check - null == undefined is true, but we want strict
    if (user == null) {
      console.log('User not found');
      return false;
    }

    // BUG #5: Accessing nested property without null check on preferences
    // user.preferences could be undefined if data is malformed
    if (!user.preferences.notificationsEnabled) {
      console.log('User has notifications disabled');
      return false;
    }

    // BUG #6: Not checking if user.email exists or is valid
    const notification: Notification = {
      id: this.generateId(),
      userId: user.id,
      message,
      type,
      priority: this.calculatePriority(type),
      createdAt: new Date(),
    };

    // BUG #7: Fire-and-forget async operation - we never await the queue result
    this.queue.enqueue(notification);

    // BUG #8: Always returning true even though the notification hasn't been sent yet
    console.log('Email queued!');
    return true;
  }

  async sendBulkAlerts(userIds: string[], message: string): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    // BUG #9: Sequential processing of users - inefficient for large arrays
    // BUG #10: No rate limiting or batching
    for (const userId of userIds) {
      // BUG #11: If one fails, we continue but don't properly track partial failures
      const success = await this.sendAlert(userId, message);
      results.set(userId, success);
    }

    return results;
  }

  async sendCriticalAlert(user: User, message: string): Promise<NotificationResult> {
    // BUG #12: Critical alerts should bypass preference check but don't
    // BUG #13: Directly using user object without validation

    // BUG #14: Mutating the input user object
    user.metadata = user.metadata || {};
    user.metadata.lastCriticalAlert = new Date();

    // BUG #15: Not awaiting properly - this.emailProvider.send returns a Promise
    // but we're treating the result as if it's synchronous
    try {
      const sent = this.emailProvider.send(
        user.email,
        'CRITICAL ALERT',
        message
      );

      // BUG #16: 'sent' is a Promise<boolean>, not boolean - this check always passes
      if (sent) {
        this.lastSentEmails.push(user.email);
        return {
          success: true,
          notificationId: this.generateId(),
          timestamp: new Date(),
        };
      }
    } catch (error) {
      // BUG #17: Error is caught but only logged, not properly propagated
      console.error('Failed to send critical alert:', error);
    }

    return {
      success: false,
      notificationId: this.generateId(),
      timestamp: new Date(),
      error: 'Failed to send critical alert',
    };
  }

  private async getUser(userId: string): Promise<User | null> {
    // BUG #18: Cache is never invalidated - stale user preferences
    if (this.userCache.has(userId)) {
      return this.userCache.get(userId)!;
    }

    const user = await this.userRepository.findById(userId);

    // BUG #19: Caching null values - once a user is not found, they're forever not found
    this.userCache.set(userId, user!);
    return user;
  }

  private async processNotification(notification: Notification): Promise<boolean> {
    const user = await this.getUser(notification.userId);

    // BUG #20: Double-checking user but with same flawed logic as sendAlert
    if (user == null) {
      return false;
    }

    // BUG #21: Type coercion issue - comparing type with == instead of ===
    // 'critical' == 'critical' works, but edge cases with type coercion can fail
    const subject = notification.type == 'critical' ? 'URGENT: ' + notification.message : notification.message;

    try {
      // BUG #22: Not checking the return value of send()
      await this.emailProvider.send(user.email, subject, notification.message);
      return true;
    } catch (error) {
      // BUG #23: Swallowing the error - upstream has no idea why it failed
      console.error(`Failed to process notification ${notification.id}`);
      return false;
    }
  }

  private generateId(): string {
    // BUG #24: Not cryptographically secure, potential collision in high-volume scenarios
    return Math.random().toString(36).substring(2, 15);
  }

  private calculatePriority(type: Notification['type']): number {
    // BUG #25: Magic numbers without documentation, 'critical' not handled specially
    const priorities: Record<string, number> = {
      alert: 5,
      info: 1,
      warning: 3,
    };
    // BUG #26: Returns undefined for 'critical' type, which becomes NaN in comparisons
    return priorities[type];
  }

  // BUG #27: No cleanup method - userCache and lastSentEmails grow forever
  // BUG #28: No way to check queue status or pending notifications
}
