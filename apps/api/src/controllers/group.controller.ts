import { Response, NextFunction } from 'express';
import { prisma } from 'database';
import { AddParticipantsSchema, UpdateParticipantRoleSchema } from 'shared';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const addMembers = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const conversationId = req.params.id;
    const currentUserId = req.user?.id as string;

    const parseResult = AddParticipantsSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const { userIds } = parseResult.data;

    // Check if caller is participant and admin
    const callerParticipant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: currentUserId,
        },
      },
    });

    if (!callerParticipant || callerParticipant.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can add participants' });
      return;
    }

    // Add new participants (skip already existing)
    const existingParticipants = await prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        userId: { in: userIds },
      },
      select: { userId: true },
    });

    const existingUserIds = existingParticipants.map((p) => p.userId);
    const userIdsToAdd = userIds.filter((uid) => !existingUserIds.includes(uid));

    if (userIdsToAdd.length === 0) {
      res.status(200).json({ message: 'All users are already participants' });
      return;
    }

    await prisma.conversationParticipant.createMany({
      data: userIdsToAdd.map((uid) => ({
        conversationId,
        userId: uid,
        role: 'MEMBER',
      })),
    });

    // Fetch the newly added participants with their user details
    const newParticipants = await prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        userId: { in: userIdsToAdd },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            status: true,
          },
        },
      },
    });

    res.status(200).json({
      message: 'Participants added successfully',
      addedParticipants: newParticipants,
    });
  } catch (error) {
    next(error);
  }
};

export const removeMember = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const conversationId = req.params.id;
    const targetUserId = req.body.userId;
    const currentUserId = req.user?.id as string;

    if (!targetUserId) {
      res.status(400).json({ error: 'User ID is required to remove member' });
      return;
    }

    if (targetUserId === currentUserId) {
      res.status(400).json({ error: 'You cannot remove yourself. Use leave conversation endpoint.' });
      return;
    }

    // Check if caller is admin
    const callerParticipant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: currentUserId,
        },
      },
    });

    if (!callerParticipant || callerParticipant.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can remove participants' });
      return;
    }

    // Remove member
    await prisma.conversationParticipant.delete({
      where: {
        conversationId_userId: {
          conversationId,
          userId: targetUserId,
        },
      },
    });

    res.status(200).json({ message: 'Member removed successfully', userId: targetUserId });
  } catch (error) {
    next(error);
  }
};

export const updateMemberRole = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const conversationId = req.params.id;
    const currentUserId = req.user?.id as string;

    const parseResult = UpdateParticipantRoleSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const { userId: targetUserId, role } = parseResult.data;

    // Check if caller is admin
    const callerParticipant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: currentUserId,
        },
      },
    });

    if (!callerParticipant || callerParticipant.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can change participant roles' });
      return;
    }

    // Update member role
    const updated = await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId: targetUserId,
        },
      },
      data: { role },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    res.status(200).json({ message: 'Member role updated successfully', participant: updated });
  } catch (error) {
    next(error);
  }
};
