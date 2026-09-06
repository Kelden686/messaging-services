import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import fs from 'fs';
import path from 'path';

let s3Client: S3Client | null = null;
let isS3Available = false;

// Ensure upload directory exists for local fallback
if (!fs.existsSync(config.UPLOAD_DIR)) {
  fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
}

if (config.USE_LOCAL_STORAGE !== 'true') {
  try {
    s3Client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: 'us-east-1',
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY,
        secretAccessKey: config.S3_SECRET_KEY,
      },
      forcePathStyle: config.S3_FORCE_PATH_STYLE === 'true',
    });
    isS3Available = true;
  } catch (error) {
    console.warn('⚠️ S3 client failed to initialize. Falling back to local storage.');
    isS3Available = false;
  }
}

export const checkS3Status = () => isS3Available;

export const s3Service = {
  async getPresignedUploadUrl(key: string, contentType: string): Promise<{ uploadUrl: string; downloadUrl: string; method: string; isLocalFallback: boolean }> {
    if (isS3Available && s3Client) {
      try {
        const command = new PutObjectCommand({
          Bucket: config.S3_BUCKET,
          Key: key,
          ContentType: contentType,
        });
        
        // URL expires in 15 minutes (900 seconds)
        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
        const downloadUrl = `${config.S3_ENDPOINT}/${config.S3_BUCKET}/${key}`;
        
        return {
          uploadUrl,
          downloadUrl,
          method: 'PUT',
          isLocalFallback: false,
        };
      } catch (err) {
        console.warn('Failed to generate S3 URL. Falling back to local upload route.', err);
      }
    }
    
    // Local fallback: return a POST route on our Express server
    const uploadUrl = `http://localhost:${config.PORT}/api/upload/local-file?key=${encodeURIComponent(key)}`;
    const downloadUrl = `http://localhost:${config.PORT}/uploads/${key}`;
    
    return {
      uploadUrl,
      downloadUrl,
      method: 'POST',
      isLocalFallback: true,
    };
  }
};
export { isS3Available };
