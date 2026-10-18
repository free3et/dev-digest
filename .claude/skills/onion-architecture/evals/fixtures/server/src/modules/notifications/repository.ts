import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface QueuedNotification {
  workspaceId: string;
  runId: string;
  summary: string;
}

export class NotificationsRepository {
  constructor(private db: Db) {}

  async enqueue(input: QueuedNotification) {
    const [row] = await this.db.insert(t.notificationQueue).values(input).returning();
    return row!;
  }
}
