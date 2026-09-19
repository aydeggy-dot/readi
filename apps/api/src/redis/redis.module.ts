import { Global, Inject, Logger, Module, type OnApplicationShutdown } from "@nestjs/common";
import { Redis } from "ioredis";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";

export const REDIS = Symbol("REDIS");

function createRedis(env: Env): Redis {
  const logger = new Logger("Redis");
  const client = new Redis(env.REDIS_URL, {
    connectTimeout: env.HEALTH_CHECK_TIMEOUT_MS,
    // Commands issued while (re)connecting wait for the connection; if Redis stays down they fail
    // after one reconnect attempt instead of hanging (callers also apply their own timeouts).
    maxRetriesPerRequest: 1,
  });
  // ioredis retries forever; log transitions only, so a stopped Redis does not flood the log.
  let connected = true;
  client.on("error", (error: NodeJS.ErrnoException) => {
    if (connected) logger.warn(`connection lost (${error.code ?? error.name}); retrying`);
    connected = false;
  });
  client.on("ready", () => {
    if (!connected) logger.log("connected");
    connected = true;
  });
  return client;
}

@Global()
@Module({
  providers: [{ provide: REDIS, inject: [ENV], useFactory: createRedis }],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}
