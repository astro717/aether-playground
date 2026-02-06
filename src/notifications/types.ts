export interface User {
  id: string;
  email: string;
  name: string;
  preferences: {
    notificationsEnabled: boolean;
    emailFrequency: 'instant' | 'daily' | 'weekly';
    channels: string[];
  };
  metadata?: Record<string, any>;
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  type: 'alert' | 'info' | 'warning' | 'critical';
  priority: number;
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface NotificationResult {
  success: boolean;
  notificationId: string;
  timestamp: Date;
  error?: string;
}

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<boolean>;
  sendBatch(emails: Array<{ to: string; subject: string; body: string }>): Promise<boolean[]>;
}
