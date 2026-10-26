import { Response, NextFunction } from 'express';
import { prisma } from 'database';
import { AddContactSchema } from 'shared';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const getContacts = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const currentUserId = req.user?.id as string;

    // Fetch contacts initiated by the user
    const initiatedContacts = await prisma.contact.findMany({
      where: { userId: currentUserId },
      include: {
        contactUser: {
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            status: true,
            isOnline: true,
            lastSeenAt: true,
          },
        },
      },
    });

    // Fetch contacts received by the user
    const receivedContacts = await prisma.contact.findMany({
      where: { contactUserId: currentUserId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            status: true,
            isOnline: true,
            lastSeenAt: true,
          },
        },
      },
    });

    // Format contacts list
    const contactsList = [
      ...initiatedContacts.map((c) => ({
        id: c.id,
        user: c.contactUser,
        status: c.status === 'PENDING' ? 'PENDING_SENT' : c.status,
        updatedAt: c.updatedAt,
      })),
      ...receivedContacts.map((c) => ({
        id: c.id,
        user: c.user,
        status: c.status === 'PENDING' ? 'PENDING_RECEIVED' : c.status,
        updatedAt: c.updatedAt,
      })),
    ];

    res.status(200).json(contactsList);
  } catch (error) {
    next(error);
  }
};

export const addContact = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parseResult = AddContactSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const currentUserId = req.user?.id as string;
    const { searchQuery } = parseResult.data;
    const query = searchQuery.trim();

    // Check if user is searching for themselves
    const isSelf = await prisma.user.findFirst({
      where: {
        id: currentUserId,
        OR: [
          { email: query },
          { email: query.toLowerCase() },
          { name: query },
          { phone: query },
        ],
      },
    });

    if (isSelf) {
      res.status(400).json({ error: 'You cannot add yourself as a contact' });
      return;
    }

    // Find the contact target user (case-insensitive for email, exact or partial for name/phone)
    const targetUser = await prisma.user.findFirst({
      where: {
        AND: [
          { id: { not: currentUserId } },
          {
            OR: [
              { email: query },
              { email: query.toLowerCase() },
              { name: query },
              { name: { contains: query } },
              { phone: query },
              { phone: { contains: query } },
            ],
          },
        ],
      },
    });

    if (!targetUser) {
      res.status(404).json({ error: 'User not found. Please check the email, name, or phone number.' });
      return;
    }

    // Check if relation already exists
    const existingRelation = await prisma.contact.findFirst({
      where: {
        OR: [
          { userId: currentUserId, contactUserId: targetUser.id },
          { userId: targetUser.id, contactUserId: currentUserId },
        ],
      },
    });

    if (existingRelation) {
      if (existingRelation.status === 'ACCEPTED') {
        res.status(400).json({ error: 'You are already contacts' });
        return;
      }
      if (existingRelation.status === 'BLOCKED') {
        res.status(400).json({ error: 'Contact block exists' });
        return;
      }
      // If it's pending
      if (existingRelation.userId === currentUserId) {
        res.status(400).json({ error: 'Contact request already sent' });
        return;
      } else {
        // If it's pending received, auto accept it!
        const updated = await prisma.contact.update({
          where: { id: existingRelation.id },
          data: { status: 'ACCEPTED' },
        });

        // Broadcast notification to the other user
        const io = req.app.get('io');
        if (io) {
          const currentUser = await prisma.user.findUnique({
            where: { id: currentUserId },
            select: { id: true, name: true, avatar: true, status: true },
          });
          if (currentUser) {
            io.to(`user:${targetUser.id}`).emit('contact_request', {
              id: updated.id,
              user: currentUser,
              status: 'ACCEPTED',
              updatedAt: updated.updatedAt,
            });
          }
        }

        res.status(200).json({ message: 'Contact request accepted', contact: updated });
        return;
      }
    }

    // Create new contact relation (PENDING)
    const newContact = await prisma.contact.create({
      data: {
        userId: currentUserId,
        contactUserId: targetUser.id,
        status: 'PENDING',
      },
      include: {
        contactUser: {
          select: {
            id: true,
            name: true,
            avatar: true,
            status: true,
          },
        },
      },
    });

    // Broadcast notification to the target recipient user
    const io = req.app.get('io');
    if (io) {
      const currentUser = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { id: true, name: true, avatar: true, status: true },
      });
      if (currentUser) {
        io.to(`user:${targetUser.id}`).emit('contact_request', {
          id: newContact.id,
          user: currentUser,
          status: 'PENDING_RECEIVED',
          updatedAt: newContact.updatedAt,
        });
      }
    }

    res.status(201).json({
      message: 'Contact request sent',
      contact: {
        id: newContact.id,
        user: newContact.contactUser,
        status: 'PENDING_SENT',
        updatedAt: newContact.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const acceptContact = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const contactRelationId = req.params.id;
    const currentUserId = req.user?.id as string;

    const contact = await prisma.contact.findUnique({
      where: { id: contactRelationId },
    });

    if (!contact) {
      res.status(404).json({ error: 'Contact request not found' });
      return;
    }

    if (contact.contactUserId !== currentUserId) {
      res.status(403).json({ error: 'You can only accept requests sent to you' });
      return;
    }

    const updatedContact = await prisma.contact.update({
      where: { id: contactRelationId },
      data: { status: 'ACCEPTED' },
    });

    // Broadcast notification to both initiator and acceptor
    const io = req.app.get('io');
    if (io) {
      const currentUser = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { id: true, name: true, avatar: true, status: true },
      });
      const otherUser = await prisma.user.findUnique({
        where: { id: contact.userId },
        select: { id: true, name: true, avatar: true, status: true },
      });

      if (currentUser) {
        io.to(`user:${contact.userId}`).emit('contact_request', {
          id: updatedContact.id,
          user: currentUser,
          status: 'ACCEPTED',
          updatedAt: updatedContact.updatedAt,
        });
      }

      if (otherUser) {
        io.to(`user:${currentUserId}`).emit('contact_request', {
          id: updatedContact.id,
          user: otherUser,
          status: 'ACCEPTED',
          updatedAt: updatedContact.updatedAt,
        });
      }
    }

    res.status(200).json({
      message: 'Contact request accepted',
      contact: updatedContact,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteContact = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const contactRelationId = req.params.id;
    const currentUserId = req.user?.id as string;

    const contact = await prisma.contact.findFirst({
      where: {
        id: contactRelationId,
        OR: [
          { userId: currentUserId },
          { contactUserId: currentUserId },
        ],
      },
    });

    if (!contact) {
      res.status(404).json({ error: 'Contact relation not found' });
      return;
    }

    await prisma.contact.delete({
      where: { id: contactRelationId },
    });

    res.status(200).json({ message: 'Contact removed successfully' });
  } catch (error) {
    next(error);
  }
};

export const blockContact = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const targetUserId = req.params.id; // user ID to block
    const currentUserId = req.user?.id as string;

    // Check if relation already exists
    const existingRelation = await prisma.contact.findFirst({
      where: {
        OR: [
          { userId: currentUserId, contactUserId: targetUserId },
          { userId: targetUserId, contactUserId: currentUserId },
        ],
      },
    });

    if (existingRelation) {
      // Force change to block under block-initiator A -> B
      const updated = await prisma.contact.update({
        where: { id: existingRelation.id },
        data: {
          userId: currentUserId,
          contactUserId: targetUserId,
          status: 'BLOCKED',
        },
      });
      res.status(200).json({ message: 'Contact blocked successfully', contact: updated });
    } else {
      // Create new BLOCKED relationship
      const newBlock = await prisma.contact.create({
        data: {
          userId: currentUserId,
          contactUserId: targetUserId,
          status: 'BLOCKED',
        },
      });
      res.status(200).json({ message: 'Contact blocked successfully', contact: newBlock });
    }
  } catch (error) {
    next(error);
  }
};
