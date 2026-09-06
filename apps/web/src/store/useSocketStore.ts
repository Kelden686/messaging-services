import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from 'shared';
import { useChatStore } from './useChatStore';

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;

  connectSocket: () => void;
  disconnectSocket: () => void;
  emitTypingStart: (conversationId: string) => void;
  emitTypingStop: (conversationId: string) => void;
  emitMessageRead: (conversationId: string) => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,

  connectSocket: () => {
    // Return if already connected
    if (get().socket?.connected) return;

    // Disconnect old socket if any
    if (get().socket) {
      get().socket!.disconnect();
    }

    const token = localStorage.getItem('accessToken');

    const socketInstance = io('http://127.0.0.1:5000', {
      auth: { token },
      withCredentials: true, // Send httpOnly cookies
      autoConnect: true,
      transports: ['websocket'],
    });

    socketInstance.on('connect', () => {
      console.log('⚡ Socket connected successfully');
      set({ isConnected: true });
    });

    socketInstance.on('disconnect', () => {
      console.log('⚠️ Socket disconnected');
      set({ isConnected: false });
    });

    // Real-time events binding to Chat Store
    
    // 1. Message Relay
    socketInstance.on(SOCKET_EVENTS.RECEIVE_MESSAGE, (message) => {
      useChatStore.getState().addMessage(message);
    });

    // 2. Typing Indicators
    socketInstance.on(SOCKET_EVENTS.TYPING_START, ({ conversationId, userId, userName }) => {
      useChatStore.getState().setTyping(conversationId, userId, userName, true);
    });

    socketInstance.on(SOCKET_EVENTS.TYPING_STOP, ({ conversationId, userId }) => {
      useChatStore.getState().setTyping(conversationId, userId, '', false);
    });

    // 3. Read Receipts Ticks
    socketInstance.on(SOCKET_EVENTS.MESSAGE_READ_RECEIPT, ({ conversationId, userId, messageIds }) => {
      useChatStore.getState().updateReadReceipts(conversationId, userId, messageIds);
    });

    // 4. Presence status
    socketInstance.on(SOCKET_EVENTS.USER_STATUS_CHANGE, ({ userId, isOnline, lastSeenAt }) => {
      useChatStore.getState().updateUserPresence(userId, isOnline, lastSeenAt);
    });

    // 5. Deletions
    socketInstance.on('message_deleted', ({ messageId }) => {
      useChatStore.getState().markMessageDeleted(messageId);
    });

    // 6. Reactions
    socketInstance.on(SOCKET_EVENTS.REACTION_ADDED, ({ messageId, reaction }) => {
      useChatStore.getState().addReaction(messageId, reaction);
    });

    socketInstance.on(SOCKET_EVENTS.REACTION_REMOVED, ({ messageId, userId }) => {
      useChatStore.getState().removeReaction(messageId, userId);
    });

    // 7. Contact request real-time notifications
    socketInstance.on('contact_request', (data) => {
      useChatStore.getState().fetchContacts();
      if (data.status === 'ACCEPTED') {
        useChatStore.getState().fetchConversations();
      }
    });

    set({ socket: socketInstance });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },

  emitTypingStart: (conversationId) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit(SOCKET_EVENTS.TYPING_START, { conversationId });
    }
  },

  emitTypingStop: (conversationId) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit(SOCKET_EVENTS.TYPING_STOP, { conversationId });
    }
  },

  emitMessageRead: (conversationId) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit(SOCKET_EVENTS.MESSAGE_READ, { conversationId });
    }
  },
}));
