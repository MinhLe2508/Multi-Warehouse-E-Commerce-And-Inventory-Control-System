import {
  Injectable,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';

@Injectable()
export class HealthService implements OnApplicationShutdown {
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
    max: 3,
  });

  constructor() {
    this.pool.on('error', () => undefined);
  }

  async check() {
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      connectTimeout: 2000,
      commandTimeout: 2000,
      retryStrategy: () => null,
      maxRetriesPerRequest: 0,
    });
    redis.on('error', () => undefined);
    try {
      await Promise.all([
        this.pool.query("SELECT '[1,2,3]'::vector"),
        redis.ping(),
      ]);
      return { status: 'ok', postgres: 'up', pgvector: 'up', redis: 'up' };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    } finally {
      redis.disconnect();
    }
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
