import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config(); // Also check local app directory .env

export const config = {
  PORT: process.env.PORT || 5000,
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/messaging_db?schema=public',
  JWT_SECRET: process.env.JWT_SECRET || 'messaging_app_jwt_secret_key_123',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'messaging_app_jwt_refresh_secret_key_123',
  
  // Email / Gmail SMTP Settings
  EMAIL_USER: process.env.EMAIL_USER || '',
  EMAIL_PASS: process.env.EMAIL_PASS || '',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
  
  // Redis Settings
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // Storage Settings
  S3_ENDPOINT: process.env.S3_ENDPOINT || 'http://localhost:9000',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || 'minioadmin',
  S3_SECRET_KEY: process.env.S3_SECRET_KEY || 'minioadminpassword',
  S3_BUCKET: process.env.S3_BUCKET || 'messaging-bucket',
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE || 'true',
  
  // Local File Upload Settings (Fallback if S3 is not available)
  USE_LOCAL_STORAGE: process.env.USE_LOCAL_STORAGE || 'true', // Default fallback enabled
  UPLOAD_DIR: path.join(__dirname, '../uploads'),
  
  // Frontend URL for CORS
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
};
