// backend/config/redis.js
import { createClient } from 'redis';

let redisClient = null;

const initializeRedis = async () => {
  if (redisClient) {
    return redisClient;
  }

  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      password: process.env.REDIS_PASSWORD || undefined,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('❌ Redis reconnection failed after 10 attempts');
            return new Error('Too many retry attempts');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis Client Error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('🔄 Redis connecting...');
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis connected and ready');
    });

    redisClient.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
    });

    await redisClient.connect();
    return redisClient;

  } catch (error) {
    console.error('❌ Failed to initialize Redis:', error.message);
    throw error;
  }
};

// Verification code storage
export const storeVerificationCode = async (phone, codeData) => {
  const key = `verification:${phone}`;
  const value = JSON.stringify({
    code: codeData.code,
    phone: codeData.phone,
    email: codeData.email,
    name: codeData.name,
    timestamp: Date.now(),
    attempts: 0
  });
  
  const client = await initializeRedis();
  await client.setEx(key, 300, value); // 5 minutes expiry
  console.log(`✅ Verification code stored for ${phone}`);
};

export const getVerificationCode = async (phone) => {
  const key = `verification:${phone}`;
  const client = await initializeRedis();
  const data = await client.get(key);
  
  return data ? JSON.parse(data) : null;
};

export const incrementAttempts = async (phone) => {
  const key = `verification:${phone}`;
  const client = await initializeRedis();
  const data = await getVerificationCode(phone);
  
  if (!data) return null;
  
  data.attempts += 1;
  const ttl = await client.ttl(key);
  await client.setEx(key, ttl, JSON.stringify(data));
  
  return data.attempts;
};

export const deleteVerificationCode = async (phone) => {
  const key = `verification:${phone}`;
  const client = await initializeRedis();
  await client.del(key);
  console.log(`🧹 Verification code deleted for ${phone}`);
};

// Rate limiting
export const checkRateLimit = async (phone) => {
  const key = `ratelimit:verification:${phone}`;
  const client = await initializeRedis();
  
  const count = await client.incr(key);
  
  if (count === 1) {
    await client.expire(key, 3600); // 1 hour
  }
  
  const maxRequests = parseInt(process.env.MAX_CODE_REQUESTS_PER_HOUR || '3');
  
  if (count > maxRequests) {
    const ttl = await client.ttl(key);
    throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(ttl / 60)} minutes.`);
  }
  
  return true;
};

// Graceful shutdown
export const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    console.log('👋 Redis connection closed');
  }
};

export { redisClient, initializeRedis };
export default initializeRedis;