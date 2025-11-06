// server/config/redis-vercel.js - Upstash Redis for Vercel Deployment
import { Redis } from '@upstash/redis';

let redisClient = null;

const initializeRedis = () => {
  if (redisClient) {
    return redisClient;
  }

  try {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    console.log('✅ Upstash Redis initialized for Vercel');
    return redisClient;
  } catch (error) {
    console.error('❌ Failed to initialize Upstash Redis:', error.message);
    throw error;
  }
};

// Verification code storage
export const storeVerificationCode = async (phone, codeData) => {
  const key = `verification:${phone}`;
  const client = initializeRedis();
  
  const data = JSON.stringify({
    code: codeData.code,
    phone: codeData.phone,
    email: codeData.email,
    name: codeData.name,
    timestamp: Date.now(),
    attempts: 0
  });
  
  await client.setex(key, 300, data); // 5 minutes expiry
  console.log(`✅ Verification code stored for ${phone}`);
};

export const getVerificationCode = async (phone) => {
  const key = `verification:${phone}`;
  const client = initializeRedis();
  const data = await client.get(key);
  
  return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
};

export const incrementAttempts = async (phone) => {
  const key = `verification:${phone}`;
  const client = initializeRedis();
  const data = await getVerificationCode(phone);
  
  if (!data) return null;
  
  data.attempts += 1;
  const ttl = await client.ttl(key);
  
  // Ensure TTL is valid
  const expiryTime = ttl > 0 ? ttl : 300;
  await client.setex(key, expiryTime, JSON.stringify(data));
  
  return data.attempts;
};

export const deleteVerificationCode = async (phone) => {
  const key = `verification:${phone}`;
  const client = initializeRedis();
  await client.del(key);
  console.log(`🧹 Verification code deleted for ${phone}`);
};

export const checkRateLimit = async (phone) => {
  const key = `ratelimit:verification:${phone}`;
  const client = initializeRedis();
  
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

export const closeRedis = async () => {
  // Upstash REST API doesn't need explicit closing
  console.log('👋 Upstash Redis connection handled by SDK');
};

export { redisClient, initializeRedis };
export default initializeRedis;