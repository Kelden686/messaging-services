import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { s3Service } from '../services/s3.service';
import { config } from '../config';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const getPresignedUrl = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filename = req.query.filename as string;
    const contentType = req.query.contentType as string;

    if (!filename || !contentType) {
      res.status(400).json({ error: 'filename and contentType query parameters are required' });
      return;
    }

    // Generate a unique key for the file
    const fileExtension = path.extname(filename);
    const uniqueId = crypto.randomUUID();
    const key = `${uniqueId}${fileExtension}`;

    // Get upload credentials
    const uploadDetails = await s3Service.getPresignedUploadUrl(key, contentType);

    res.status(200).json({
      ...uploadDetails,
      filename,
      key,
    });
  } catch (error) {
    next(error);
  }
};

// Handle raw body binary upload when falling back to local Express server
export const handleLocalUpload = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const key = req.query.key as string;

    if (!key) {
      res.status(400).json({ error: 'Upload key query parameter is required' });
      return;
    }

    // Sanitize the filename to prevent directory traversal
    const safeKey = path.basename(key);
    const filePath = path.join(config.UPLOAD_DIR, safeKey);

    const writeStream = fs.createWriteStream(filePath);

    req.pipe(writeStream);

    writeStream.on('finish', () => {
      res.status(200).json({
        message: 'File uploaded successfully (local fallback)',
        url: `http://localhost:${config.PORT}/uploads/${safeKey}`,
      });
    });

    writeStream.on('error', (err) => {
      console.error('File write stream error:', err);
      res.status(500).json({ error: 'Failed to write file to local disk' });
    });
  } catch (error) {
    next(error);
  }
};
