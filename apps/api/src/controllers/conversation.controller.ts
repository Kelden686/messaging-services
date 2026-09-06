import { Response, NextFunction } from 'express';
import { prisma } from 'database';
import { CreateConversationSchema, UpdateGroupSchema } from 'shared';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const getConversations = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const currentUserId = req.user?.id as string;

    // Find all conversations the user is participating in
    const participations = await prisma.conversationParticipant.findMany({
      where: { userId: currentUserId },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    avatar: true,
                    status: true,
                    isOnline: true,
                    lastSeenAt: true,
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                sender: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const conversationsWithDetails = await Promise.all(
      participations.map(async (p) => {
        const conversation = p.conversation;
        const lastMessage = conversation.messages[0] || null;

        // Calculate unread count for this participant
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conversation.id,
            createdAt: { gt: p.joinedAt },
            senderId: { not: currentUserId },
            readReceipts: {
              none: {
                userId: currentUserId,
              },
            },
          },
        });

        // For direct chats, name and avatar are derived from the other participant
        let name = conversation.name;
        let avatar = conversation.avatar;

        if (conversation.type === 'DIRECT') {
          const otherParticipant = conversation.participants.find(
            (part) => part.userId !== currentUserId
          );
          if (otherParticipant) {
            name = otherParticipant.user.name;
            avatar = otherParticipant.user.avatar;
          }
        }

        return {
          id: conversation.id,
          type: conversation.type,
          name,
          avatar,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          lastMessage,
          unreadCount,
          participants: conversation.participants.map((part) => ({
            id: part.id,
            userId: part.userId,
            role: part.role,
            joinedAt: part.joinedAt,
            mutedUntil: part.mutedUntil,
            user: part.user,
          })),
        };
      })
    );

    // Sort by last message time (or conversation creation time if no messages)
    conversationsWithDetails.sort((a, b) => {
      const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
      const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
      return timeB - timeA;
    });

    res.status(200).json(conversationsWithDetails);
  } catch (error) {
    next(error);
  }
};

export const createConversation = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parseResult = CreateConversationSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const currentUserId = req.user?.id as string;
    const { type, name, avatar, participantIds } = parseResult.data;

    // DIRECT Conversation logic
    if (type === 'DIRECT') {
      const targetUserId = participantIds?.[0];
      if (!targetUserId) {
        res.status(400).json({ error: 'Direct conversation requires exactly one participant' });
        return;
      }

      // Check if a direct conversation already exists between the two users
      const existingDirect = await prisma.conversation.findFirst({
        where: {
          type: 'DIRECT',
          AND: [
            { participants: { some: { userId: currentUserId } } },
            { participants: { some: { userId: targetUserId } } },
          ],
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                  status: true,
                  isOnline: true,
                  lastSeenAt: true,
                },
              },
            },
          },
        },
      });

      if (existingDirect) {
        res.status(200).json(existingDirect);
        return;
      }

      // Create new Direct conversation
      const newDirect = await prisma.conversation.create({
        data: {
          type: 'DIRECT',
          createdById: currentUserId,
          participants: {
            create: [
              { userId: currentUserId, role: 'ADMIN' },
              { userId: targetUserId, role: 'MEMBER' },
            ],
          },
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                  status: true,
                  isOnline: true,
                  lastSeenAt: true,
                },
              },
            },
          },
        },
      });

      res.status(201).json(newDirect);
      return;
    }

    // GROUP or CHANNEL logic
    if (!name) {
      res.status(400).json({ error: 'Group or Channel name is required' });
      return;
    }

    const allParticipantIds = Array.from(new Set([currentUserId, ...(participantIds || [])]));

    const conversation = await prisma.conversation.create({
      data: {
        type,
        name,
        avatar: avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`,
        createdById: currentUserId,
        participants: {
          create: allParticipantIds.map((uid) => ({
            userId: uid,
            role: uid === currentUserId ? 'ADMIN' : 'MEMBER',
          })),
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                status: true,
                isOnline: true,
                lastSeenAt: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json(conversation);
  } catch (error) {
    next(error);
  }
};

export const getConversationById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const conversationId = req.params.id;
    const currentUserId = req.user?.id as string;

    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: currentUserId,
        },
      },
    });

    if (!participant) {
      res.status(403).json({ error: 'You are not a participant in this conversation' });
      return;
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                status: true,
                isOnline: true,
                lastSeenAt: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Direct chat overrides
    let name = conversation.name;
    let avatar = conversation.avatar;

    if (conversation.type === 'DIRECT') {
      const otherParticipant = conversation.participants.find((p) => p.userId !== currentUserId);
      if (otherParticipant) {
        name = otherParticipant.user.name;
        avatar = otherParticipant.user.avatar;
      }
    }

    res.status(200).json({
      ...conversation,
      name,
      avatar,
    });
  } catch (error) {
    next(error);
  }
};

export const updateConversation = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const conversationId = req.params.id;
    const currentUserId = req.user?.id as string;

    const parseResult = UpdateGroupSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    // Check if participant is admin
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: currentUserId,
        },
      },
    });

    if (!participant || participant.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can modify conversation settings' });
      return;
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: parseResult.data,
    });

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

export const leaveConversation = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const conversationId = req.params.id;
    const currentUserId = req.user?.id as string;

    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: currentUserId,
        },
      },
    });

    if (!participant) {
      res.status(400).json({ error: 'You are not in this conversation' });
      return;
    }

    // Remove user from conversation
    await prisma.conversationParticipant.delete({
      where: {
        conversationId_userId: {
          conversationId,
          userId: currentUserId,
        },
      },
    });

    // If it was group/channel and no participants left, delete conversation entirely
    const remainingCount = await prisma.conversationParticipant.count({
      where: { conversationId },
    });

    if (remainingCount === 0) {
      await prisma.conversation.delete({
        where: { id: conversationId },
      });
    }

    res.status(200).json({ message: 'Left conversation successfully' });
  } catch (error) {
    next(error);
  }
};
