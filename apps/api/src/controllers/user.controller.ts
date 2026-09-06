import { Response, NextFunction } from 'express';
import { prisma } from 'database';
import { UpdateProfileSchema } from 'shared';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const getMe = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        status: true,
        phone: true,
        publicKey: true,
        isOnline: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

export const searchUsers = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = req.query.q as string;
    const currentUserId = req.user?.id;

    if (!query || query.trim() === '') {
      res.status(200).json([]);
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: query } },
              { email: { contains: query } },
              { phone: { contains: query } },
            ],
          },
          { id: { not: currentUserId } },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        status: true,
        isOnline: true,
        lastSeenAt: true,
      },
      take: 20,
    });

    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parseResult = UpdateProfileSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const userId = req.user?.id;
    const updateData = parseResult.data;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        status: true,
        phone: true,
        publicKey: true,
        isOnline: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });

    res.status(200).json({
      message: 'Profile updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};
