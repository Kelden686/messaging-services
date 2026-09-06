import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from 'database';
import { SOCKET_EVENTS } from 'shared';
import { config } from '../config';

// Track active connections per user
const activeUserSockets = new Map<string, Set<string>>();
// Track disconnect timeout handles for grace period
const disconnectTimeouts = new Map<string, NodeJS.Timeout>();

export const initSocketHandler = (io: Server) => {
  // Authentication middleware for Socket.io
  io.use(async (socket: Socket, next) => {
    try {
      // Fetch token from headers or cookies
      let token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];

      // Fallback: parse cookies manually from headers
      if (!token && socket.handshake.headers.cookie) {
        const cookies = Object.fromEntries(
          socket.handshake.headers.cookie.split(';').map((c) => c.trim().split('='))
        );
        token = cookies['accessToken'];
      }

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, config.JWT_SECRET) as { userId: string };
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, name: true },
      });

      if (!user) {
        return next(new Error('User session invalid'));
      }

      socket.data.userId = user.id;
      socket.data.userName = user.name;
      next();
    } catch (err) {
      next(new Error('Unauthorized socket connection'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const userId = socket.data.userId;
    const userName = socket.data.userName;

    console.log(`🔌 User connected: ${userName} (${userId}) - Socket: ${socket.id}`);
    
    // Join personal user room to receive user-targeted events
    socket.join(`user:${userId}`);

    // Cancel pending disconnect offline status change if user reconnected
    if (disconnectTimeouts.has(userId)) {
      clearTimeout(disconnectTimeouts.get(userId)!);
      disconnectTimeouts.delete(userId);
    }

    // Add socket to active connections
    if (!activeUserSockets.has(userId)) {
      activeUserSockets.set(userId, new Set());
    }
    activeUserSockets.get(userId)!.add(socket.id);

    // Update status in DB and notify peers if this is their first connection
    if (activeUserSockets.get(userId)!.size === 1) {
      await updateUserStatus(userId, true, io);
    }

    // Auto-join socket rooms for all conversations the user is in
    const userConversations = await prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true },
    });

    userConversations.forEach((c) => {
      socket.join(`room:${c.conversationId}`);
    });

    // 1. Join Conversation Room explicitly
    socket.on(SOCKET_EVENTS.JOIN_CONVERSATION, ({ conversationId }) => {
      socket.join(`room:${conversationId}`);
    });

    // 2. Leave Conversation Room explicitly
    socket.on(SOCKET_EVENTS.LEAVE_CONVERSATION, ({ conversationId }) => {
      socket.leave(`room:${conversationId}`);
    });

    // 3. Typing Indicators
    socket.on(SOCKET_EVENTS.TYPING_START, ({ conversationId }) => {
      socket.to(`room:${conversationId}`).emit(SOCKET_EVENTS.TYPING_START, {
        conversationId,
        userId,
        userName,
      });
    });

    socket.on(SOCKET_EVENTS.TYPING_STOP, ({ conversationId }) => {
      socket.to(`room:${conversationId}`).emit(SOCKET_EVENTS.TYPING_STOP, {
        conversationId,
        userId,
      });
    });

    // 4. Real-time Message Read Receipt
    socket.on(SOCKET_EVENTS.MESSAGE_READ, async ({ conversationId }) => {
      try {
        const participant = await prisma.conversationParticipant.findUnique({
          where: {
            conversationId_userId: {
              conversationId,
              userId,
            },
          },
        });

        if (!participant) return;

        // Fetch all unread messages in conversation (except sent by self)
        const unreadMessages = await prisma.message.findMany({
          where: {
            conversationId,
            senderId: { not: userId },
            createdAt: { gt: participant.joinedAt },
            readReceipts: {
              none: { userId },
            },
          },
          select: { id: true },
        });

        if (unreadMessages.length === 0) return;

        await prisma.messageReadReceipt.createMany({
          data: unreadMessages.map((m) => ({
            messageId: m.id,
            userId,
          })),
        });

        // Notify room participants
        io.to(`room:${conversationId}`).emit(SOCKET_EVENTS.MESSAGE_READ_RECEIPT, {
          conversationId,
          userId,
          messageIds: unreadMessages.map((m) => m.id),
          readAt: new Date(),
        });
      } catch (err) {
        console.error('Error handling message_read socket event:', err);
      }
    });

    // 5. Disconnect handling with grace period
    socket.on('disconnect', () => {
      console.log(`🔌 User disconnected socket: ${userName} (${userId}) - Socket: ${socket.id}`);

      const userSockets = activeUserSockets.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          activeUserSockets.delete(userId);

          // Start 5-second grace period before marking offline
          const timeout = setTimeout(async () => {
            await updateUserStatus(userId, false, io);
            disconnectTimeouts.delete(userId);
          }, 5000);

          disconnectTimeouts.set(userId, timeout);
        }
      }
    });
  });
};

// Helper function to update status and notify rooms
async function updateUserStatus(userId: string, isOnline: boolean, io: Server) {
  try {
    const lastSeenAt = new Date();
    await prisma.user.update({
      where: { id: userId },
      data: { isOnline, lastSeenAt },
    });

    // Fetch all conversation IDs the user is part of
    const participations = await prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true },
    });

    // Broadcast to all conversation rooms
    participations.forEach((p) => {
      io.to(`room:${p.conversationId}`).emit(SOCKET_EVENTS.USER_STATUS_CHANGE, {
        userId,
        isOnline,
        lastSeenAt,
      });
    });
  } catch (err) {
    console.error(`Failed to update status for user ${userId}:`, err);
  }
}
