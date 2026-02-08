import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  async sensitiveOperation(): Promise<void> {
    this.logger.log('Operation completed successfully');
  }
}
