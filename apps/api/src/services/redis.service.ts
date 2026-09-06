import Redis from 'ioredis';
import { config } from '../config';

let redisClient: Redis | null = null;
let isRedisAvailable = false;

// Simple in-memory fallback cache
const memoryCache = new Map<string, { value: string; expiresAt: number }>();

try {
  redisClient = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 3) {
        console.warn('⚠️ Redis connection failed. Falling back to in-memory cache.');
        isRedisAvailable = false;
        return null; // Stop retrying
      }
      return Math.min(times * 100, 2000);
    },
  });

  redisClient.on('connect', () => {
    console.log('✅ Connected to Redis successfully');
    isRedisAvailable = true;
  });

  redisClient.on('error', (err) => {
    // Suppress heavy logs of connection failure
    isRedisAvailable = false;
  });
} catch (error) {
  console.warn('⚠️ Could not initialize Redis client. Falling back to in-memory cache.');
  isRedisAvailable = false;
}

export const getRedisClient = () => {
  return isRedisAvailable ? redisClient : null;
};

export const checkRedisStatus = () => isRedisAvailable;

export const cacheService = {
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (isRedisAvailable && redisClient) {
      await redisClient.set(key, value, 'EX', ttlSeconds);
    } else {
      const expiresAt = Date.now() + ttlSeconds * 1000;
      memoryCache.set(key, { value, expiresAt });
    }
  },

  async get(key: string): Promise<string | null> {
    if (isRedisAvailable && redisClient) {
      return await redisClient.get(key);
    } else {
      const data = memoryCache.get(key);
      if (!data) return null;
      if (Date.now() > data.expiresAt) {
        memoryCache.delete(key);
        return null;
      }
      return data.value;
    }
  },

  async delete(key: string): Promise<void> {
    if (isRedisAvailable && redisClient) {
      await redisClient.del(key);
    } else {
      memoryCache.delete(key);
    }
  },
};
