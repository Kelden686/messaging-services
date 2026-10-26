import { create } from 'zustand';
import { apiClient } from '../utils/apiClient';
import { useAuthStore } from './useAuthStore';

export interface Participant {
  id: string;
  userId: string;
  role: 'ADMIN' | 'MEMBER';
  joinedAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatar: string;
    status: string;
    isOnline: boolean;
    lastSeenAt: string;
  };
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'FILE' | 'VOICE' | 'LOCATION';
  content: string | null;
  mediaUrl: string | null;
  mediaName: string | null;
  mediaSize: number | null;
  replyToId: string | null;
  isEdited: boolean;
  deletedAt: string | null;
  createdAt: string;
  sender: {
    id: string;
    name: string;
    avatar: string;
  };
  replyTo?: {
    id: string;
    content: string | null;
    type: string;
    sender: {
      id: string;
      name: string;
    };
  };
  reactions: Array<{
    id: string;
    emoji: string;
    userId: string;
    user: {
      id: string;
      name: string;
    };
  }>;
  readReceipts: Array<{
    userId: string;
    readAt: string;
  }>;
}

export interface Conversation {
  id: string;
  type: 'DIRECT' | 'GROUP' | 'CHANNEL';
  name: string | null;
  avatar: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage: Message | null;
  unreadCount: number;
  participants: Participant[];
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  typingUsers: Record<string, Array<{ userId: string; userName: string }>>;

  contacts: any[];

  setConversations: (conversations: Conversation[]) => void;
  setContacts: (contacts: any[]) => void;
  setActiveConversationId: (id: string | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  markMessageDeleted: (messageId: string) => void;
  addReaction: (messageId: string, reaction: any) => void;
  removeReaction: (messageId: string, userId: string) => void;
  updateUserPresence: (userId: string, isOnline: boolean, lastSeenAt: string) => void;
  updateReadReceipts: (conversationId: string, userId: string, messageIds: string[]) => void;
  setTyping: (conversationId: string, userId: string, userName: string, isTyping: boolean) => void;
  fetchConversations: () => Promise<void>;
  fetchContacts: () => Promise<void>;
  resetChatStore: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  typingUsers: {},
  contacts: [],

  setConversations: (conversations) => set({ conversations }),
  setContacts: (contacts) => set({ contacts }),
  setActiveConversationId: (activeConversationId) =>
    set((state) => ({
      activeConversationId,
      messages: [],
      conversations: state.conversations.map((c) =>
        c.id === activeConversationId ? { ...c, unreadCount: 0 } : c
      ),
    })),
  setMessages: (messages) => set({ messages }),

  addMessage: (message) =>
    set((state) => {
      const currentUserId = useAuthStore.getState().user?.id;

      // 1. Add to active messages array if it belongs to selected chat
      const isForActiveChat = state.activeConversationId === message.conversationId;
      const updatedMessages = isForActiveChat
        ? [...state.messages.filter((m) => m.id !== message.id), message]
        : state.messages;

      // If conversation is not in local state, fetch conversations so it appears immediately
      const conversationExists = state.conversations.some((c) => c.id === message.conversationId);
      if (!conversationExists) {
        setTimeout(() => {
          useChatStore.getState().fetchConversations();
        }, 50);
      }

      // 2. Update conversation list preview & unread counts
      const updatedConversations = state.conversations.map((c) => {
        if (c.id === message.conversationId) {
          const isSender = message.senderId === currentUserId;
          return {
            ...c,
            lastMessage: message,
            unreadCount: isForActiveChat || isSender ? 0 : c.unreadCount + 1,
          };
        }
        return c;
      });

      // Sort conversations by last message timestamp
      updatedConversations.sort((a, b) => {
        const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
        const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
        return timeB - timeA;
      });

      return {
        messages: updatedMessages,
        conversations: updatedConversations,
      };
    }),

  updateMessage: (updatedMsg) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === updatedMsg.id ? updatedMsg : m)),
      conversations: state.conversations.map((c) => {
        if (c.lastMessage?.id === updatedMsg.id) {
          return { ...c, lastMessage: updatedMsg };
        }
        return c;
      }),
    })),

  markMessageDeleted: (messageId) =>
    set((state) => {
      const updatedMessages = state.messages.map((m) => {
        if (m.id === messageId) {
          return {
            ...m,
            content: 'This message was deleted',
            mediaUrl: null,
            mediaName: null,
            mediaSize: null,
            type: 'TEXT' as const,
            deletedAt: new Date().toISOString(),
          };
        }
        return m;
      });

      const updatedConversations = state.conversations.map((c) => {
        if (c.lastMessage?.id === messageId) {
          return {
            ...c,
            lastMessage: {
              ...c.lastMessage,
              content: 'This message was deleted',
              mediaUrl: null,
              mediaName: null,
              mediaSize: null,
              type: 'TEXT' as const,
              deletedAt: new Date().toISOString(),
            },
          };
        }
        return c;
      });

      return {
        messages: updatedMessages,
        conversations: updatedConversations,
      };
    }),

  addReaction: (messageId, reaction) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id === messageId) {
          const reactions = m.reactions.filter((r) => r.userId !== reaction.userId);
          return { ...m, reactions: [...reactions, reaction] };
        }
        return m;
      }),
    })),

  removeReaction: (messageId, userId) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id === messageId) {
          return { ...m, reactions: m.reactions.filter((r) => r.userId !== userId) };
        }
        return m;
      }),
    })),

  updateUserPresence: (userId, isOnline, lastSeenAt) =>
    set((state) => {
      const updateParticipantPresence = (participants: Participant[]) =>
        participants.map((p) => {
          if (p.userId === userId) {
            return {
              ...p,
              user: { ...p.user, isOnline, lastSeenAt },
            };
          }
          return p;
        });

      return {
        conversations: state.conversations.map((c) => {
          const updatedParts = updateParticipantPresence(c.participants);
          return {
            ...c,
            participants: updatedParts,
          };
        }),
      };
    }),

  updateReadReceipts: (conversationId, userId, messageIds) =>
    set((state) => {
      // Update ticks to blue in the messages list
      const updatedMessages = state.messages.map((m) => {
        if (messageIds.includes(m.id)) {
          const receipts = m.readReceipts.filter((r) => r.userId !== userId);
          return {
            ...m,
            readReceipts: [...receipts, { userId, readAt: new Date().toISOString() }],
          };
        }
        return m;
      });

      const currentUserId = useAuthStore.getState().user?.id;
      return {
        messages: updatedMessages,
        conversations: state.conversations.map((c) => {
          if (c.id === conversationId && userId === currentUserId) {
            return { ...c, unreadCount: 0 };
          }
          return c;
        }),
      };
    }),

  setTyping: (conversationId, userId, userName, isTyping) =>
    set((state) => {
      const currentList = state.typingUsers[conversationId] || [];
      const filtered = currentList.filter((u) => u.userId !== userId);
      const updatedList = isTyping ? [...filtered, { userId, userName }] : filtered;

      return {
        typingUsers: {
          ...state.typingUsers,
          [conversationId]: updatedList,
        },
      };
    }),

  fetchConversations: async () => {
    try {
      const data = await apiClient('/conversations');
      set({ conversations: data });
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  },

  fetchContacts: async () => {
    try {
      const data = await apiClient('/contacts');
      set({ contacts: data });
    } catch (err) {
      console.error('Error fetching contacts:', err);
    }
  },

  resetChatStore: () => set({ conversations: [], activeConversationId: null, messages: [], typingUsers: {}, contacts: [] }),
}));
