import { Response, NextFunction } from 'express';
import { prisma } from 'database';
import { SendMessageSchema, ReactionSchema, SOCKET_EVENTS } from 'shared';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { cacheService } from '../services/redis.service';

// Helper to get cache key for "Delete for me" messages
const getDeletedForMeKey = (userId: string): string => `deleted_me:${userId}`;

export const getMessages = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const conversationId = req.params.id;
    const currentUserId = req.user?.id as string;
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string || '30', 10);

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: currentUserId,
        },
      },
    });

    if (!participant) {
      res.status(403).json({ error: 'You are not a member of this conversation' });
      return;
    }

    // Fetch message IDs deleted for this user
    const deletedForMeStr = await cacheService.get(getDeletedForMeKey(currentUserId)) || '[]';
    const deletedForMeIds: string[] = JSON.parse(deletedForMeStr);

    // Fetch messages
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        id: { notIn: deletedForMeIds },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // Fetch one extra message to get the next cursor
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        readReceipts: {
          select: {
            userId: true,
            readAt: true,
          },
        },
      },
    });

    let nextCursor: string | undefined = undefined;
    if (messages.length > limit) {
      const nextItem = messages.pop();
      nextCursor = nextItem?.id;
    }

    // Format soft deleted messages for everyone
    const formattedMessages = messages.map((m) => {
      if (m.deletedAt) {
        return {
          ...m,
          content: 'This message was deleted',
          mediaUrl: null,
          mediaName: null,
          mediaSize: null,
          type: 'TEXT',
        };
      }
      return m;
    });

    // Reverse back to chronological order (since we queried desc for cursor pagination)
    formattedMessages.reverse();

    res.status(200).json({
      messages: formattedMessages,
      nextCursor,
    });
  } catch (error) {
    next(error);
  }
};

export const createMessage = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const conversationId = req.params.id;
    const currentUserId = req.user?.id as string;

    const parseResult = SendMessageSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const { type, content, mediaUrl, mediaName, mediaSize, replyToId } = parseResult.data;

    // Verify membership and fetch conversation details
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: currentUserId,
        },
      },
      include: {
        conversation: true,
      },
    });

    if (!participant) {
      res.status(403).json({ error: 'You are not a member of this conversation' });
      return;
    }

    // Channel restrictions: Only admins can send messages
    if (participant.conversation.type === 'CHANNEL' && participant.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can broadcast to channels' });
      return;
    }

    // Create Message in DB
    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: currentUserId,
        type,
        content,
        mediaUrl,
        mediaName,
        mediaSize,
        replyToId,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        reactions: true,
        readReceipts: true,
      },
    });

    // Auto-create read receipt for sender
    await prisma.messageReadReceipt.create({
      data: {
        messageId: message.id,
        userId: currentUserId,
      },
    });

    // Broadcast message via Socket.io to conversation room and each participant's personal room
    const io = req.app.get('io');
    if (io) {
      io.to(`room:${conversationId}`).emit(SOCKET_EVENTS.RECEIVE_MESSAGE, message);
      
      const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
      });
      participants.forEach((p) => {
        io.to(`user:${p.userId}`).emit(SOCKET_EVENTS.RECEIVE_MESSAGE, message);
      });
    }

    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
};

export const editMessage = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const messageId = req.params.id;
    const currentUserId = req.user?.id as string;
    const { content } = req.body;

    if (!content || content.trim() === '') {
      res.status(400).json({ error: 'Message content is required to edit' });
      return;
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    if (message.senderId !== currentUserId) {
      res.status(403).json({ error: 'You can only edit your own messages' });
      return;
    }

    // Check 15 minute limit
    const diffMs = Date.now() - new Date(message.createdAt).getTime();
    const diffMins = diffMs / 1000 / 60;
    if (diffMins > 15) {
      res.status(400).json({ error: 'Messages can only be edited within 15 minutes of sending' });
      return;
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        content,
        isEdited: true,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        readReceipts: true,
      },
    });

    // Broadcast update via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.to(`room:${message.conversationId}`).emit(SOCKET_EVENTS.RECEIVE_MESSAGE, updatedMessage);
    }

    res.status(200).json(updatedMessage);
  } catch (error) {
    next(error);
  }
};

export const deleteMessage = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const messageId = req.params.id;
    const currentUserId = req.user?.id as string;
    const { type } = req.body; // 'ME' or 'EVERYONE'

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const io = req.app.get('io');

    if (type === 'EVERYONE') {
      // Must be sender of message to delete for everyone (or channel admin)
      let canDelete = message.senderId === currentUserId;

      if (!canDelete) {
        const participant = await prisma.conversationParticipant.findUnique({
          where: {
            conversationId_userId: {
              conversationId: message.conversationId,
              userId: currentUserId,
            },
          },
        });
        if (participant?.role === 'ADMIN') {
          canDelete = true;
        }
      }

      if (!canDelete) {
        res.status(403).json({ error: 'You are not authorized to delete this message' });
        return;
      }

      // Soft delete for everyone
      const updated = await prisma.message.update({
        where: { id: messageId },
        data: { deletedAt: new Date() },
      });

      // Broadcast soft deletion event
      if (io) {
        io.to(`room:${message.conversationId}`).emit('message_deleted', {
          messageId,
          conversationId: message.conversationId,
        });
      }

      res.status(200).json({ message: 'Message deleted for everyone', messageId, conversationId: message.conversationId });
    } else {
      // Delete for ME: save ID to local user deleted cache
      const cacheKey = getDeletedForMeKey(currentUserId);
      const deletedForMeStr = await cacheService.get(cacheKey) || '[]';
      const deletedForMeIds: string[] = JSON.parse(deletedForMeStr);
      
      if (!deletedForMeIds.includes(messageId)) {
        deletedForMeIds.push(messageId);
        await cacheService.set(cacheKey, JSON.stringify(deletedForMeIds), 30 * 24 * 60 * 60); // 30 days retention
      }

      res.status(200).json({ message: 'Message deleted for you', messageId, conversationId: message.conversationId });
    }
  } catch (error) {
    next(error);
  }
};


export const addReaction = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const messageId = req.params.id;
    const currentUserId = req.user?.id as string;

    const parseResult = ReactionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const { emoji } = parseResult.data;

    // Check message existence
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    // Upsert reaction (a user can have one active reaction per message)
    const reaction = await prisma.messageReaction.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId: currentUserId,
        },
      },
      create: {
        messageId,
        userId: currentUserId,
        emoji,
      },
      update: {
        emoji,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Broadcast reaction add via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.to(`room:${message.conversationId}`).emit(SOCKET_EVENTS.REACTION_ADDED, {
        messageId,
        reaction,
      });
    }

    res.status(200).json(reaction);
  } catch (error) {
    next(error);
  }
};

export const removeReaction = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const messageId = req.params.id;
    const currentUserId = req.user?.id as string;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    await prisma.messageReaction.delete({
      where: {
        messageId_userId: {
          messageId,
          userId: currentUserId,
        },
      },
    });

    // Broadcast reaction remove via Socket.io
    const io = req.app.get('io');
    if (io && message) {
      io.to(`room:${message.conversationId}`).emit(SOCKET_EVENTS.REACTION_REMOVED, {
        messageId,
        userId: currentUserId,
      });
    }

    res.status(200).json({ message: 'Reaction removed', messageId, userId: currentUserId });
  } catch (error) {
    next(error);
  }
};
