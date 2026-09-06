import { z } from 'zod';

// ==========================================
// Authentication Schemas
// ==========================================

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  avatar: z.string().url('Invalid avatar URL').optional().or(z.literal('')),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const VerifyOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().length(6, 'OTP code must be 6 digits'),
});

export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;

// ==========================================
// User Profile Schemas
// ==========================================

export const UpdateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  avatar: z.string().url('Invalid avatar URL').optional().or(z.literal('')),
  status: z.string().max(100, 'Status bio is too long').optional(),
  phone: z.string().optional(),
  publicKey: z.string().optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

// ==========================================
// Contact Schemas
// ==========================================

export const AddContactSchema = z.object({
  searchQuery: z.string().min(1, 'Username, email, or phone is required'),
});

export type AddContactInput = z.infer<typeof AddContactSchema>;

// ==========================================
// Conversation Schemas
// ==========================================

export const CreateConversationSchema = z.object({
  type: z.enum(['DIRECT', 'GROUP', 'CHANNEL']),
  name: z.string().min(1, 'Name is required').optional(),
  avatar: z.string().url('Invalid avatar URL').optional().or(z.literal('')),
  participantIds: z.array(z.string()).min(1, 'At least one participant is required').optional(),
});

export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;

export const UpdateGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  avatar: z.string().url('Invalid avatar URL').optional().or(z.literal('')),
});

export type UpdateGroupInput = z.infer<typeof UpdateGroupSchema>;

export const AddParticipantsSchema = z.object({
  userIds: z.array(z.string()).min(1, 'At least one user must be added'),
});

export type AddParticipantsInput = z.infer<typeof AddParticipantsSchema>;

export const UpdateParticipantRoleSchema = z.object({
  userId: z.string(),
  role: z.enum(['ADMIN', 'MEMBER']),
});

export type UpdateParticipantRoleInput = z.infer<typeof UpdateParticipantRoleSchema>;

// ==========================================
// Message Schemas
// ==========================================

export const SendMessageSchema = z.object({
  type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'FILE', 'VOICE', 'LOCATION']),
  content: z.string().optional(),
  mediaUrl: z.string().url('Invalid media URL').optional().or(z.literal('')),
  mediaName: z.string().optional(),
  mediaSize: z.number().int().positive().optional(),
  replyToId: z.string().optional(),
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export const ReactionSchema = z.object({
  emoji: z.string().min(1, 'Emoji is required'),
});

export type ReactionInput = z.infer<typeof ReactionSchema>;

// ==========================================
// Socket Event Constants
// ==========================================

export const SOCKET_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',

  // Conversation Management
  JOIN_CONVERSATION: 'join_conversation',
  LEAVE_CONVERSATION: 'leave_conversation',

  // Message events
  SEND_MESSAGE: 'send_message',
  RECEIVE_MESSAGE: 'receive_message',
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',
  
  // Message statuses
  MESSAGE_READ: 'message_read',
  MESSAGE_READ_RECEIPT: 'message_read_receipt',

  // Reaction events
  REACTION_ADDED: 'reaction_added',
  REACTION_REMOVED: 'reaction_removed',

  // Presence events
  USER_STATUS_CHANGE: 'user_status_change',
} as const;

export type SocketEvents = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];
