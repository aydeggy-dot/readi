import { Injectable, Logger } from "@nestjs/common";
import { AiWorkerClient } from "../ai-worker/ai-worker.client";

/**
 * Deleting LLM traces (ADR-0008). Langfuse holds our prompts and our prompts hold candidate
 * answers and CV text, so it is a personal-data store with the same two obligations as our own
 * database: a deleted account's traces go with it, and everything else ages out.
 *
 * The worker does the deleting, because it is the only thing holding Langfuse credentials
 * (ADR-0004). Without keys it answers `enabled: false` and a zero count, which is why nothing here
 * — and nothing in `eraseUser` — needs a second switch to know whether tracing is on.
 */
@Injectable()
export class TracesService {
  private readonly logger = new Logger(TracesService.name);

  constructor(private readonly worker: AiWorkerClient) {}

  /**
   * Every trace belonging to a user. **Throws** if the worker cannot be reached, deliberately:
   * erasure then fails and the next hourly sweep retries the whole of it. Continuing would erase
   * the user row and leave their traces behind with nothing left that could find them — the same
   * reason `eraseUser` deletes their files before it touches the database.
   */
  async deleteForUser(userId: string): Promise<number> {
    const { enabled, deleted } = await this.worker.deleteTraces({
      user_id: userId,
      expired: false,
    });
    if (enabled) this.logger.log(`deleted ${deleted} trace(s) for an erased account`);
    return deleted;
  }

  /**
   * Everything past the worker's retention window, hourly. A failure is logged and left to the
   * next sweep rather than thrown: unlike erasure, nothing downstream depends on this run, and a
   * throw here would abandon the rest of the sweep.
   */
  async purgeExpired(): Promise<number> {
    try {
      const { enabled, deleted } = await this.worker.deleteTraces({
        user_id: null,
        expired: true,
      });
      if (enabled && deleted > 0) this.logger.log(`trace retention: deleted ${deleted}`);
      return deleted;
    } catch (error) {
      this.logger.error(
        `trace retention sweep failed: ${error instanceof Error ? error.name : "unknown error"}`,
      );
      return 0;
    }
  }
}
