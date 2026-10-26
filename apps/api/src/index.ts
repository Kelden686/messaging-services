import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

import { config } from './config';
import { errorHandler } from './middlewares/error.middleware';
import { authenticateJWT } from './middlewares/auth.middleware';
import { checkRedisStatus } from './services/redis.service';
import { initSocketHandler } from './socket/socket.handler';

// Controllers
import * as authController from './controllers/auth.controller';
import * as userController from './controllers/user.controller';
import * as contactController from './controllers/contact.controller';
import * as conversationController from './controllers/conversation.controller';
import * as groupController from './controllers/group.controller';
import * as messageController from './controllers/message.controller';
import * as uploadController from './controllers/upload.controller';

const app = express();
const server = http.createServer(app);

// Configure WebSockets
const io = new SocketServer(server, {
  cors: {
    origin: config.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST'],
  },
});

app.set('io', io);

// Socket.io Scaling with Redis Adapter (if available)
if (checkRedisStatus()) {
  try {
    const pubClient = new Redis(config.REDIS_URL);
    const subClient = new Redis(config.REDIS_URL);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.io Redis scaling adapter configured successfully');
  } catch (err) {
    console.warn('⚠️ Could not load Redis scaling adapter for Socket.io, falling back to local memory adapter');
  }
} else {
  console.log('ℹ️ Running Socket.io with in-memory local adapter');
}

// Global Middlewares
app.use(
  helmet({
    crossOriginResourcePolicy: false, // Allow static file loading on client
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, origin || true);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Static file serving for uploads (local fallback)
app.use('/uploads', express.static(config.UPLOAD_DIR));

// Logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ==========================================
// API Routes
// ==========================================

// Auth Routes
app.post('/api/auth/register', authController.register);
app.post('/api/auth/verify-otp', authController.verifyOtp);
app.post('/api/auth/login', authController.login);
app.post('/api/auth/refresh', authController.refresh);
app.post('/api/auth/logout', authController.logout);

// User Routes (Protected)
app.get('/api/users/me', authenticateJWT as any, userController.getMe);
app.get('/api/users/search', authenticateJWT as any, userController.searchUsers);
app.put('/api/users/profile', authenticateJWT as any, userController.updateProfile);

// Contact Routes (Protected)
app.get('/api/contacts', authenticateJWT as any, contactController.getContacts);
app.post('/api/contacts', authenticateJWT as any, contactController.addContact);
app.put('/api/contacts/:id/accept', authenticateJWT as any, contactController.acceptContact);
app.post('/api/contacts/:id/accept', authenticateJWT as any, contactController.acceptContact);
app.delete('/api/contacts/:id', authenticateJWT as any, contactController.deleteContact);
app.post('/api/contacts/:id/block', authenticateJWT as any, contactController.blockContact);

// Conversation Routes (Protected)
app.get('/api/conversations', authenticateJWT as any, conversationController.getConversations);
app.post('/api/conversations', authenticateJWT as any, conversationController.createConversation);
app.get('/api/conversations/:id', authenticateJWT as any, conversationController.getConversationById);
app.put('/api/conversations/:id', authenticateJWT as any, conversationController.updateConversation);
app.delete('/api/conversations/:id/leave', authenticateJWT as any, conversationController.leaveConversation);

// Group/Channel Management Routes (Protected)
app.post('/api/groups/:id/members', authenticateJWT as any, groupController.addMembers);
app.delete('/api/groups/:id/members', authenticateJWT as any, groupController.removeMember);
app.put('/api/groups/:id/role', authenticateJWT as any, groupController.updateMemberRole);

// Message Routes (Protected)
app.get('/api/conversations/:id/messages', authenticateJWT as any, messageController.getMessages);
app.post('/api/conversations/:id/messages', authenticateJWT as any, messageController.createMessage);
app.put('/api/messages/:id', authenticateJWT as any, messageController.editMessage);
app.delete('/api/messages/:id', authenticateJWT as any, messageController.deleteMessage);
app.post('/api/messages/:id/reactions', authenticateJWT as any, messageController.addReaction);
app.delete('/api/messages/:id/reactions', authenticateJWT as any, messageController.removeReaction);

// Upload Routes (Protected)
app.get('/api/upload/presigned-url', authenticateJWT as any, uploadController.getPresignedUrl);
app.post('/api/upload/local-file', authenticateJWT as any, uploadController.handleLocalUpload);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Error handling
app.use(errorHandler);

// Initialize Socket.io Logic
initSocketHandler(io);

// Start Server
const PORT = config.PORT;
server.listen(PORT, () => {
  console.log(`🚀 API Server running on port http://localhost:${PORT}`);
});
