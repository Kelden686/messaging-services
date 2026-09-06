import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore, Message, Conversation } from '../../store/useChatStore';
import { useSocketStore } from '../../store/useSocketStore';
import { apiClient } from '../../utils/apiClient';
import { 
  Send, Smile, Paperclip, Mic, MapPin, Search, Menu, Info, CornerUpLeft, 
  Edit3, Trash2, X, Play, Square, AlertCircle, ArrowDown, ChevronRight, FileText
} from 'lucide-react';

const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

interface ChatWindowProps {
  onToggleInfo: () => void;
  onBack: () => void; // Callback to return to chat list on mobile viewports
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ onToggleInfo, onBack }) => {
  const { user: currentUser } = useAuthStore();
  const { 
    activeConversationId, messages, setMessages, addMessage, updateMessage, 
    markMessageDeleted, addReaction, removeReaction, typingUsers 
  } = useChatStore();
  const { emitTypingStart, emitTypingStop, emitMessageRead } = useSocketStore();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [inputText, setInputText] = useState('');
  
  // Media / File upload state
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Editing & Thread Reply states
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [searchInChatQuery, setSearchInChatQuery] = useState('');
  const [showSearchInChat, setShowSearchInChat] = useState(false);

  // Delete message modal state
  const [deleteTargetMessage, setDeleteTargetMessage] = useState<Message | null>(null);

  // Message references for scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollHelper, setShowScrollHelper] = useState(false);

  // Typing state tracking
  const typingTimeoutRef = useRef<any>(null);
  const isTypingLocalRef = useRef(false);

  // Fetch conversation meta details
  const fetchConversationDetails = async () => {
    if (!activeConversationId) return;
    try {
      const data = await apiClient(`/conversations/${activeConversationId}`);
      setConversation(data);
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch conversation messages
  const fetchMessages = async () => {
    if (!activeConversationId) return;
    try {
      const data = await apiClient(`/conversations/${activeConversationId}/messages?limit=50`);
      setMessages(data.messages);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeConversationId) {
      fetchConversationDetails();
      fetchMessages();
      emitMessageRead(activeConversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  // Handle typing indicator timeouts
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (!activeConversationId) return;

    if (!isTypingLocalRef.current) {
      isTypingLocalRef.current = true;
      emitTypingStart(activeConversationId);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      isTypingLocalRef.current = false;
      emitTypingStop(activeConversationId);
    }, 2000);
  };

  // Pin scrolling behavior
  const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('auto');
  }, [messages.length]);

  // Detect scroll offset for helper arrow
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isFar = scrollHeight - scrollTop - clientHeight > 300;
    setShowScrollHelper(isFar);
  };

  // Send Message
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (inputText.trim() === '' || !activeConversationId) return;

    // Clear typing triggers
    isTypingLocalRef.current = false;
    emitTypingStop(activeConversationId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    const body: any = {
      type: 'TEXT',
      content: inputText,
    };

    if (replyingTo) {
      body.replyToId = replyingTo.id;
    }

    setInputText('');
    setReplyingTo(null);

    try {
      await apiClient(`/conversations/${activeConversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      scrollToBottom('smooth');
    } catch (err) {
      console.error(err);
    }
  };

  // Edit Message
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMessage || editText.trim() === '') return;

    try {
      await apiClient(`/messages/${editingMessage.id}`, {
        method: 'PUT',
        body: JSON.stringify({ content: editText }),
      });
      setEditingMessage(null);
      setEditText('');
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Message (Everyone vs Me)
  const handleDeleteConfirm = async (deleteType: 'ME' | 'EVERYONE') => {
    if (!deleteTargetMessage) return;

    try {
      await apiClient(`/messages/${deleteTargetMessage.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ type: deleteType }),
      });
      
      if (deleteType === 'EVERYONE') {
        markMessageDeleted(deleteTargetMessage.id);
      } else {
        // Local removal: refetch messages to update list
        fetchMessages();
      }
      setDeleteTargetMessage(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Reaction handle
  const handleToggleReaction = async (messageId: string, emoji: string) => {
    try {
      const activeMsg = messages.find(m => m.id === messageId);
      const existingReaction = activeMsg?.reactions.find(r => r.userId === currentUser?.id);

      if (existingReaction && existingReaction.emoji === emoji) {
        // Remove reaction
        await apiClient(`/messages/${messageId}/reactions`, { method: 'DELETE' });
        removeReaction(messageId, currentUser!.id);
      } else {
        // Add reaction
        const data = await apiClient(`/messages/${messageId}/reactions`, {
          method: 'POST',
          body: JSON.stringify({ emoji }),
        });
        addReaction(messageId, data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Voice note recorder
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await uploadAudioFile(audioBlob);
        
        // Terminate mic stream
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone access is required to record voice notes');
    }
  };

  const stopRecording = (cancel: boolean = false) => {
    if (!mediaRecorder) return;
    
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    
    if (cancel) {
      mediaRecorder.onstop = null; // discard upload listener
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    } else {
      mediaRecorder.stop();
    }
    
    setIsRecording(false);
    setMediaRecorder(null);
  };

  const uploadAudioFile = async (blob: Blob) => {
    setIsUploading(true);
    try {
      const filename = `voice-note-${Date.now()}.webm`;
      // 1. Get Presigned URL details
      const presigned = await apiClient(`/upload/presigned-url?filename=${encodeURIComponent(filename)}&contentType=audio/webm`);
      
      // 2. Perform direct upload (PUT to S3 or POST to local endpoint)
      if (presigned.isLocalFallback) {
        await fetch(presigned.uploadUrl, {
          method: 'POST',
          body: blob,
        });
      } else {
        await fetch(presigned.uploadUrl, {
          method: 'PUT',
          body: blob,
          headers: { 'Content-Type': 'audio/webm' },
        });
      }

      // 3. Send message referencing file
      await apiClient(`/conversations/${activeConversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'VOICE',
          mediaUrl: presigned.downloadUrl,
          mediaName: filename,
          mediaSize: blob.size,
          replyToId: replyingTo?.id,
        }),
      });
      setReplyingTo(null);
    } catch (err) {
      console.error(err);
      alert('Failed to upload voice note');
    } finally {
      setIsUploading(false);
    }
  };

  // Location share
  const shareLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        
        try {
          await apiClient(`/conversations/${activeConversationId}/messages`, {
            method: 'POST',
            body: JSON.stringify({
              type: 'LOCATION',
              content: mapUrl,
              replyToId: replyingTo?.id,
            }),
          });
          setReplyingTo(null);
        } catch (err) {
          console.error(err);
        }
      },
      (err) => {
        alert('Could not retrieve your location. Check GPS/permissions.');
      }
    );
  };

  // Attachment uploading
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversationId) return;

    if (file.size > 50 * 1024 * 1024) {
      alert('Files cannot exceed 50 MB in size');
      return;
    }

    setIsUploading(true);
    try {
      let msgType = 'FILE';
      if (file.type.startsWith('image/')) msgType = 'IMAGE';
      else if (file.type.startsWith('video/')) msgType = 'VIDEO';

      // 1. Get Upload Details
      const presigned = await apiClient(`/upload/presigned-url?filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`);

      // 2. Perform direct upload
      if (presigned.isLocalFallback) {
        await fetch(presigned.uploadUrl, {
          method: 'POST',
          body: file,
        });
      } else {
        await fetch(presigned.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
      }

      // 3. Send message referencing attachment
      await apiClient(`/conversations/${activeConversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          type: msgType,
          mediaUrl: presigned.downloadUrl,
          mediaName: file.name,
          mediaSize: file.size,
          replyToId: replyingTo?.id,
        }),
      });
      setReplyingTo(null);
    } catch (err) {
      console.error(err);
      alert('Failed to upload file attachment');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Format time values for layout
  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getDaySeparator = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  };

  // Filter messages for search in chat
  const searchFilteredMessages = messages.filter((m) => {
    if (m.deletedAt) return false;
    if (m.content) {
      return m.content.toLowerCase().includes(searchInChatQuery.toLowerCase());
    }
    return false;
  });

  // Calculate ticks icons for message read receipts
  const renderReadReceiptTick = (msg: Message) => {
    if (msg.senderId !== currentUser?.id) return null;
    const isGroup = conversation?.type !== 'DIRECT';
    
    // Total other participants in chat
    const othersCount = (conversation?.participants.length || 2) - 1;
    // Current read count in list excluding self
    const readCount = msg.readReceipts.filter(r => r.userId !== currentUser?.id).length;

    if (readCount >= othersCount && othersCount > 0) {
      // Blue double check
      return (
        <span className="text-blue-400 font-bold ml-1.5 flex select-none text-[10px]">
          ✓✓
        </span>
      );
    }
    
    if (readCount > 0) {
      // Grey double check
      return (
        <span className="text-zinc-400 dark:text-zinc-500 font-bold ml-1.5 flex select-none text-[10px]">
          ✓✓
        </span>
      );
    }

    // Single check
    return (
      <span className="text-zinc-400 dark:text-zinc-500 font-bold ml-1.5 flex select-none text-[10px]">
        ✓
      </span>
    );
  };

  // Emojis array for reaction picker
  const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  // Check if caller can edit (belongs to sender and is within 15 minutes)
  const canEditMessage = (msg: Message) => {
    if (msg.senderId !== currentUser?.id || msg.deletedAt) return false;
    const diffMs = Date.now() - new Date(msg.createdAt).getTime();
    return diffMs / 1000 / 60 <= 15;
  };

  // Online status details string
  const getPresenceText = () => {
    if (!conversation) return '';
    if (conversation.type !== 'DIRECT') {
      return `${conversation.participants.length} members`;
    }

    const peer = conversation.participants.find(p => p.userId !== currentUser?.id);
    if (!peer) return 'Active';
    
    if (peer.user.isOnline) {
      const activeTyping = typingUsers[conversation.id] || [];
      if (activeTyping.find(t => t.userId === peer.user.id)) {
        return 'typing...';
      }
      return 'online';
    }

    const lastSeen = new Date(peer.user.lastSeenAt);
    return `last seen at ${lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-[#efeae2] dark:bg-[#0b141a] transition-colors duration-300 relative">
      {/* Dynamic Background Image visual overlay (WhatsApp style bubble patterns) */}
      <div 
        className="absolute inset-0 opacity-[0.06] pointer-events-none dark:opacity-[0.02]"
        style={{
          backgroundImage: `url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')`,
          backgroundSize: '360px',
        }}
      />

      {/* Header */}
      <div className="p-3 bg-header-bg dark:bg-header-bg-dark border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 z-10 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <button 
            onClick={onBack}
            className="md:hidden p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-650 dark:text-zinc-350 rounded-lg cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <img 
            src={conversation?.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${conversation?.name || 'chat'}`} 
            alt="" 
            className="w-10 h-10 rounded-full object-cover shrink-0 cursor-pointer"
            onClick={onToggleInfo}
          />
          
          <div className="text-left min-w-0">
            <h4 
              className="text-sm font-bold text-zinc-850 dark:text-zinc-100 truncate cursor-pointer hover:underline"
              onClick={onToggleInfo}
            >
              {conversation?.name || 'Active Chat'}
            </h4>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium truncate block leading-none mt-0.5">
              {getPresenceText()}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowSearchInChat(!showSearchInChat)}
            className={`p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer ${showSearchInChat ? 'bg-zinc-250 dark:bg-zinc-800 text-brand-green' : 'text-zinc-550 dark:text-zinc-400'}`}
            title="Search inside chat"
          >
            <Search className="w-5 h-5" />
          </button>
          <button 
            onClick={onToggleInfo}
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-550 dark:text-zinc-400 rounded-lg transition-colors cursor-pointer"
            title="Info details"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search in Chat drawer */}
      {showSearchInChat && (
        <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-2.5 border-b border-zinc-200 dark:border-zinc-850 flex items-center justify-between gap-3 z-25">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search words inside this chat..."
              value={searchInChatQuery}
              onChange={(e) => setSearchInChatQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-zinc-100 dark:bg-zinc-800 outline-none rounded-xl text-xs text-zinc-800 dark:text-zinc-200"
            />
          </div>
          <button 
            onClick={() => {
              setShowSearchInChat(false);
              setSearchInChatQuery('');
            }}
            className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-555"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Messages Canvas */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 z-10"
      >
        {searchInChatQuery ? (
          // Render search query results
          searchFilteredMessages.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              No messages match your search.
            </div>
          ) : (
            <div className="space-y-3">
              {searchFilteredMessages.map((m) => (
                <div key={m.id} className="p-3 bg-white/70 dark:bg-zinc-900/50 backdrop-blur-sm rounded-2xl flex flex-col max-w-lg mx-auto text-left border border-zinc-200/40 dark:border-zinc-800/40">
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-xs font-bold text-brand-green">{m.sender.name}</span>
                    <span className="text-[9px] text-zinc-400">{new Date(m.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-zinc-800 dark:text-zinc-200">{m.content}</p>
                </div>
              ))}
            </div>
          )
        ) : (
          // Chronological Chat Logs grouped by date separator
          messages.map((m, index) => {
            const isMe = m.senderId === currentUser?.id;
            
            // Add date dividers
            const showDateSeparator = index === 0 || 
              getDaySeparator(m.createdAt) !== getDaySeparator(messages[index - 1].createdAt);

            return (
              <React.Fragment key={m.id}>
                {showDateSeparator && (
                  <div className="flex justify-center select-none my-6">
                    <span className="bg-white/60 dark:bg-zinc-900/50 border border-zinc-200/20 text-zinc-550 dark:text-zinc-400 font-semibold px-3 py-1 rounded-xl text-[10px] shadow-sm tracking-wide">
                      {getDaySeparator(m.createdAt)}
                    </span>
                  </div>
                )}

                <div className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'} group relative`}>
                  {/* Reaction Toolbar (displays on bubble hover) */}
                  {!m.deletedAt && (
                    <div 
                      className={`absolute top-[-26px] hidden group-hover:flex items-center gap-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-750 shadow-md px-2 py-1 rounded-full z-30 transition-all ${
                        isMe ? 'right-4' : 'left-4'
                      }`}
                    >
                      {REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => handleToggleReaction(m.id, emoji)}
                          className="hover:scale-135 active:scale-95 transition-all text-sm cursor-pointer"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  <div 
                    className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-left relative shadow-sm transition-colors border leading-snug ${
                      isMe 
                        ? 'bg-outgoing-bubble dark:bg-outgoing-bubble-dark border-emerald-100/10 dark:border-emerald-950/20 text-zinc-900 dark:text-zinc-100 rounded-tr-none' 
                        : 'bg-incoming-bubble dark:bg-incoming-bubble-dark border-zinc-200/10 dark:border-zinc-800/10 text-zinc-900 dark:text-zinc-100 rounded-tl-none'
                    }`}
                  >
                    {/* Reply to Preview anchor */}
                    {m.replyTo && (
                      <div className="bg-black/5 dark:bg-white/5 border-l-4 border-brand-green rounded-md p-1.5 mb-1.5 text-xs text-zinc-600 dark:text-zinc-350">
                        <div className="font-bold text-brand-green text-[10px] truncate">{m.replyTo.sender.name}</div>
                        <div className="truncate text-[11px]">{m.replyTo.content || 'Attachment file'}</div>
                      </div>
                    )}

                    {/* Sender Name in group chats */}
                    {!isMe && conversation?.type !== 'DIRECT' && (
                      <span className="text-[11px] font-bold text-brand-green block mb-0.5 truncate select-none">
                        {m.sender.name}
                      </span>
                    )}

                    {/* TEXT message */}
                    {m.type === 'TEXT' && (
                      <p className="text-[13px] whitespace-pre-wrap break-words">{m.content}</p>
                    )}

                    {/* IMAGE attachment */}
                    {m.type === 'IMAGE' && m.mediaUrl && (
                      <div className="rounded-xl overflow-hidden mb-1 border border-zinc-200/50 dark:border-zinc-800/50">
                        <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer">
                          <img src={m.mediaUrl} alt="attachment" className="max-h-72 object-cover w-full cursor-pointer hover:opacity-90 transition-opacity" />
                        </a>
                      </div>
                    )}

                    {/* VIDEO attachment */}
                    {m.type === 'VIDEO' && m.mediaUrl && (
                      <div className="rounded-xl overflow-hidden mb-1 border border-zinc-200/50 dark:border-zinc-800/50 max-h-72">
                        <video src={m.mediaUrl} controls className="w-full object-cover" />
                      </div>
                    )}

                    {/* VOICE attachment */}
                    {m.type === 'VOICE' && m.mediaUrl && (
                      <div className="flex items-center gap-3.5 py-1.5 pr-2">
                        <div className="p-2 bg-brand-green text-white rounded-full">
                          <Play className="w-4 h-4 fill-white" />
                        </div>
                        <audio src={m.mediaUrl} controls className="w-48 h-8 rounded-lg select-none outline-none dark:invert" />
                      </div>
                    )}

                    {/* FILE attachment */}
                    {m.type === 'FILE' && m.mediaUrl && (
                      <a 
                        href={m.mediaUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 bg-black/5 dark:bg-white/5 border border-zinc-200/20 rounded-xl p-2.5 mt-0.5 mb-1 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                      >
                        <FileText className="w-7 h-7 text-brand-green" />
                        <div className="text-left min-w-0">
                          <div className="text-xs font-bold text-zinc-850 dark:text-white truncate max-w-[160px]">{m.mediaName || 'Document'}</div>
                          <div className="text-[10px] text-zinc-400">{formatFileSize(m.mediaSize)}</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-400 ml-auto shrink-0" />
                      </a>
                    )}

                    {/* LOCATION attachment */}
                    {m.type === 'LOCATION' && (
                      <div className="space-y-1.5 py-1 text-center">
                        <div className="aspect-video bg-zinc-200 dark:bg-zinc-800 rounded-lg flex items-center justify-center border border-zinc-300 dark:border-zinc-700">
                          <MapPin className="w-8 h-8 text-red-500 animate-bounce" />
                        </div>
                        <a 
                          href={m.content || '#'} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="inline-flex items-center gap-1.5 text-xs text-brand-green font-bold hover:underline"
                        >
                          Show Location on Map
                        </a>
                      </div>
                    )}

                    {/* Message Meta status information */}
                    <div className="flex justify-end items-center mt-1 select-none text-[9px] text-zinc-400 dark:text-zinc-500">
                      <span>{formatTime(m.createdAt)}</span>
                      {m.isEdited && <span className="ml-1 text-[8px] font-semibold italic">Edited</span>}
                      {renderReadReceiptTick(m)}
                    </div>

                    {/* Reactions Display bar */}
                    {m.reactions.length > 0 && (
                      <div className="absolute bottom-[-10px] right-2.5 flex items-center bg-white dark:bg-zinc-800 border border-zinc-200/70 dark:border-zinc-700/60 shadow-sm px-1.5 py-0.5 rounded-full z-15 gap-0.5 text-[10px]">
                        {m.reactions.slice(0, 3).map((r) => (
                          <span key={r.id} title={r.user.name}>{r.emoji}</span>
                        ))}
                        {m.reactions.length > 3 && <span className="text-[8px] text-zinc-400">+{m.reactions.length - 3}</span>}
                      </div>
                    )}

                    {/* Hover Bubble menu toggles */}
                    {!m.deletedAt && (
                      <div className="absolute right-1 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <select 
                          className="bg-zinc-100 dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700 text-[10px] text-zinc-600 dark:text-zinc-400 outline-none p-0.5 cursor-pointer"
                          value=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'reply') setReplyingTo(m);
                            else if (val === 'edit') {
                              setEditingMessage(m);
                              setEditText(m.content || '');
                            }
                            else if (val === 'delete') setDeleteTargetMessage(m);
                            e.target.value = ''; // Reset select
                          }}
                        >
                          <option value="" disabled hidden>⋯</option>
                          <option value="reply">Reply</option>
                          {canEditMessage(m) && <option value="edit">Edit</option>}
                          <option value="delete">Delete</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll to Bottom helper indicator */}
      {showScrollHelper && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-20 right-4 p-2.5 bg-white dark:bg-zinc-850 hover:bg-zinc-100 border border-zinc-200 dark:border-zinc-800 text-brand-green rounded-full shadow-lg z-30 animate-bounce cursor-pointer"
        >
          <ArrowDown className="w-5 h-5" />
        </button>
      )}

      {/* Reply Preview Drawer (displays directly above input bar) */}
      {replyingTo && (
        <div className="bg-zinc-100/90 dark:bg-zinc-850/90 backdrop-blur-md p-2.5 px-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between z-20 select-none">
          <div className="border-l-4 border-brand-green pl-3 text-left">
            <span className="text-xs font-bold text-brand-green">{replyingTo.sender.name}</span>
            <p className="text-[11px] text-zinc-550 dark:text-zinc-400 truncate max-w-md mt-0.5">
              {replyingTo.content || 'Attachment file'}
            </p>
          </div>
          <button 
            onClick={() => setReplyingTo(null)}
            className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-zinc-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input Bar Section */}
      <div className="p-3 bg-header-bg dark:bg-header-bg-dark border-t border-zinc-200 dark:border-zinc-800 shrink-0 z-20 flex items-center gap-3">
        {/* Attachment & Utilities Toggles */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-550 dark:text-zinc-400 rounded-xl transition-colors cursor-pointer"
            title="Attach documents, images, video"
            disabled={isUploading}
          >
            <Paperclip className="w-5 h-5" />
          </button>
          
          <button
            onClick={shareLocation}
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-555 dark:text-zinc-400 rounded-xl transition-colors cursor-pointer"
            title="Share Location"
          >
            <MapPin className="w-5 h-5" />
          </button>
        </div>

        {/* File input (Hidden) */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange}
          className="hidden" 
        />

        {/* Text Input area OR Recording voice indicator */}
        {isRecording ? (
          // Recording wave indicator
          <div className="flex-1 bg-zinc-200 dark:bg-zinc-800 py-2.5 px-4 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping shrink-0" />
              <span className="text-xs font-semibold text-red-500 uppercase tracking-wider select-none">
                Recording {recordingSeconds}s
              </span>
              {/* wave design simulation */}
              <div className="flex gap-0.5 items-center select-none h-4">
                {[1, 2, 3, 2, 4, 1, 3, 2, 4].map((h, i) => (
                  <span 
                    key={i} 
                    className="w-0.5 bg-red-500 rounded-full audio-visualizer-bar" 
                    style={{ height: `${h * 4}px`, animation: `pulse 0.3s ease-in-out infinite alternate ${i * 0.05}s` }} 
                  />
                ))}
              </div>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => stopRecording(true)}
                className="px-3 py-1 bg-zinc-300 dark:bg-zinc-700 hover:bg-red-500/10 hover:text-red-550 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={() => stopRecording(false)}
                className="px-3 py-1 bg-brand-green text-white hover:bg-brand-green-dark text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          // Input Form field
          <form onSubmit={handleSend} className="flex-1 flex items-center gap-2">
            <textarea
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isUploading ? "Uploading file..." : "Type a message..."}
              disabled={isUploading}
              rows={1}
              className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 outline-none rounded-2xl text-sm border border-zinc-200 dark:border-zinc-700/60 focus:border-zinc-300 dark:focus:border-zinc-600 text-zinc-800 dark:text-zinc-100 max-h-24 resize-none transition-colors"
            />
            
            {inputText.trim() !== '' ? (
              <button
                type="submit"
                className="p-2.5 bg-brand-green hover:bg-brand-green-dark text-white rounded-full transition-colors cursor-pointer shadow-md shadow-emerald-500/10 active:scale-95"
              >
                <Send className="w-4 h-4 fill-white" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={isUploading}
                className="p-2.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-550 dark:text-zinc-400 rounded-full transition-colors cursor-pointer"
                title="Record Voice Note"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </form>
        )}
      </div>

      {/* ================================================================= */}
      {/* INLINE MODALS */}
      {/* ================================================================= */}

      {/* Edit Message Modal */}
      {editingMessage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setEditingMessage(null)}
              className="absolute top-4 right-4 p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Edit Message</h3>
            <p className="text-xs text-zinc-400 dark:text-zinc-550 mb-4">You can modify this message. This will update for all participants.</p>
            
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-850 outline-none rounded-xl text-sm border border-transparent focus:border-brand-green text-zinc-900 dark:text-white resize-none h-24"
              />
              <button
                type="submit"
                className="w-full py-3 bg-brand-green hover:bg-brand-green-dark text-white font-semibold rounded-xl text-sm cursor-pointer"
              >
                Save Changes
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Me vs Everyone) */}
      {deleteTargetMessage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 w-full max-w-md shadow-2xl relative text-center">
            <button 
              onClick={() => setDeleteTargetMessage(null)}
              className="absolute top-4 right-4 p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="p-3 bg-red-500/10 text-red-500 rounded-2xl inline-flex mb-3.5">
              <AlertCircle className="w-6 h-6 animate-pulse" />
            </div>

            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Delete Message</h3>
            <p className="text-xs text-zinc-450 dark:text-zinc-500 mb-6">
              Would you like to delete this message just for yourself, or delete it for everyone?
            </p>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleDeleteConfirm('ME')}
                className="py-2.5 border border-zinc-250 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold rounded-xl text-xs cursor-pointer"
              >
                Delete for Me
              </button>
              
              <button
                onClick={() => handleDeleteConfirm('EVERYONE')}
                className="py-2.5 bg-red-500 hover:bg-red-650 text-white font-semibold rounded-xl text-xs cursor-pointer"
              >
                Delete for Everyone
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
