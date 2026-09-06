import React, { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore, Conversation, Participant } from '../../store/useChatStore';
import { apiClient } from '../../utils/apiClient';
import { 
  X, Image as ImageIcon, FileText, Video, Volume2, 
  Trash2, UserMinus, ShieldAlert, ShieldCheck, LogOut, Info
} from 'lucide-react';

interface RightPaneProps {
  conversation: Conversation;
  onClose: () => void;
  onRefreshChat: () => void;
}

export const RightPane: React.FC<RightPaneProps> = ({ conversation, onClose, onRefreshChat }) => {
  const { user: currentUser } = useAuthStore();
  const { messages, setActiveConversationId } = useChatStore();

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Group roles check
  const myParticipantRecord = conversation.participants.find(p => p.userId === currentUser?.id);
  const isAdmin = myParticipantRecord?.role === 'ADMIN';

  // Extract shared media files from messages array in local store
  const mediaMessages = messages.filter(m => m.mediaUrl && !m.deletedAt);

  const handleRemoveMember = async (userId: string) => {
    try {
      setErrorMsg(null);
      await apiClient(`/groups/${conversation.id}/members`, {
        method: 'DELETE',
        body: JSON.stringify({ userId }),
      });
      onRefreshChat();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to remove member');
    }
  };

  const handleUpdateRole = async (userId: string, newRole: 'ADMIN' | 'MEMBER') => {
    try {
      setErrorMsg(null);
      await apiClient(`/groups/${conversation.id}/role`, {
        method: 'PUT',
        body: JSON.stringify({ userId, role: newRole }),
      });
      onRefreshChat();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update member role');
    }
  };

  const handleLeaveChat = async () => {
    if (!window.confirm(`Are you sure you want to leave this ${conversation.type.toLowerCase()}?`)) return;
    try {
      await apiClient(`/conversations/${conversation.id}/leave`, {
        method: 'DELETE',
      });
      setActiveConversationId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="w-full md:w-[320px] h-full flex flex-col bg-sidebar-bg dark:bg-sidebar-bg-dark border-l border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
      {/* Header */}
      <div className="p-4 bg-header-bg dark:bg-header-bg-dark flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-1.5">
          <Info className="w-4 h-4" />
          {conversation.type === 'DIRECT' ? 'Contact Info' : 'Group Info'}
        </h3>
        <button 
          onClick={onClose}
          className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Pane Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Profile Card */}
        <div className="flex flex-col items-center text-center">
          <img 
            src={conversation.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${conversation.name}`}
            alt={conversation.name || 'Chat'} 
            className="w-24 h-24 rounded-full border border-zinc-200 dark:border-zinc-800 shadow-md object-cover mb-3"
          />
          <h4 className="text-base font-bold text-zinc-800 dark:text-white leading-tight">
            {conversation.name}
          </h4>
          <span className="text-xs text-zinc-400 capitalize mt-1.5 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
            {conversation.type.toLowerCase()}
          </span>

          {conversation.type === 'DIRECT' && (
            <p className="text-xs text-zinc-550 dark:text-zinc-400 max-w-[240px] mt-3">
              {conversation.participants.find(p => p.userId !== currentUser?.id)?.user.status || 'Hey there! I am using this messaging app.'}
            </p>
          )}
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-xl flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Members List (Group/Channel) */}
        {conversation.type !== 'DIRECT' && (
          <div className="space-y-3">
            <h5 className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              Participants ({conversation.participants.length})
            </h5>
            
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {conversation.participants.map((p) => {
                const isMemberAdmin = p.role === 'ADMIN';
                const isSelf = p.userId === currentUser?.id;

                return (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-xl bg-zinc-50/50 dark:bg-zinc-800/10 border border-zinc-100 dark:border-zinc-800/20">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img src={p.user.avatar} className="w-7 h-7 rounded-full object-cover shrink-0" alt="" />
                      <div className="text-left min-w-0">
                        <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block truncate leading-tight">
                          {p.user.name} {isSelf && '(You)'}
                        </span>
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate block">
                          {p.user.status || 'Active member'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isMemberAdmin && (
                        <span className="px-1.5 py-0.5 bg-brand-green/10 text-brand-green text-[9px] font-bold rounded-md uppercase tracking-wider flex items-center gap-0.5" title="Admin">
                          <ShieldCheck className="w-3 h-3" />
                          Admin
                        </span>
                      )}

                      {/* Admin Actions */}
                      {isAdmin && !isSelf && (
                        <div className="flex items-center gap-0.5">
                          {isMemberAdmin ? (
                            <button
                              onClick={() => handleUpdateRole(p.userId, 'MEMBER')}
                              className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-450 dark:text-zinc-400 rounded-md cursor-pointer"
                              title="Demote to Member"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUpdateRole(p.userId, 'ADMIN')}
                              className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-brand-green rounded-md cursor-pointer"
                              title="Promote to Admin"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveMember(p.userId)}
                            className="p-1 hover:bg-red-500/10 text-red-500 rounded-md cursor-pointer"
                            title="Remove Member"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Shared Media Gallery */}
        <div className="space-y-3">
          <h5 className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            Shared Media ({mediaMessages.length})
          </h5>

          {mediaMessages.length === 0 ? (
            <p className="text-xs text-zinc-450 dark:text-zinc-500 text-center py-4 bg-zinc-50 dark:bg-zinc-800/10 rounded-xl">
              No shared links or documents
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {mediaMessages.map((m) => {
                const isImage = m.type === 'IMAGE';
                const isVideo = m.type === 'VIDEO';

                if (isImage && m.mediaUrl) {
                  return (
                    <a
                      key={m.id}
                      href={m.mediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aspect-square bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800/50 hover:opacity-80 transition-all cursor-pointer flex"
                    >
                      <img src={m.mediaUrl} className="object-cover w-full h-full" alt="Shared" />
                    </a>
                  );
                }

                return (
                  <a
                    key={m.id}
                    href={m.mediaUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800/50 hover:bg-zinc-200 dark:hover:bg-zinc-700/50 transition-all cursor-pointer flex flex-col items-center justify-center p-2 text-center"
                    title={m.mediaName || 'Attachment'}
                  >
                    {isVideo ? (
                      <Video className="w-5 h-5 text-blue-500 mb-1" />
                    ) : (
                      <FileText className="w-5 h-5 text-brand-green mb-1" />
                    )}
                    <span className="text-[8px] text-zinc-500 truncate max-w-full font-medium">
                      {m.mediaName || 'File'}
                    </span>
                    <span className="text-[7px] text-zinc-400">
                      {formatFileSize(m.mediaSize)}
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {conversation.type !== 'DIRECT' && (
          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-850 shrink-0">
            <button
              onClick={handleLeaveChat}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500 hover:bg-red-650 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Leave {conversation.type === 'CHANNEL' ? 'Channel' : 'Group'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
