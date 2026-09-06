import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore, Conversation } from '../../store/useChatStore';
import { useSocketStore } from '../../store/useSocketStore';
import { apiClient } from '../../utils/apiClient';
import { 
  MessageSquare, Users, Radio, Search, Plus, LogOut, Sun, Moon, 
  Settings, CheckCircle2, X, Shield, PlusCircle, Check, Bell
} from 'lucide-react';

interface SidebarProps {
  onSelectChat: () => void; // Callback for mobile responsiveness to switch view
}

export const Sidebar: React.FC<SidebarProps> = ({ onSelectChat }) => {
  const { user, logout, updateProfile } = useAuthStore();
  const { 
    conversations, 
    setConversations, 
    activeConversationId, 
    setActiveConversationId, 
    setMessages,
    contacts,
    fetchContacts,
    fetchConversations
  } = useChatStore();
  const { emitMessageRead } = useSocketStore();

  const [activeTab, setActiveTab] = useState<'chats' | 'contacts'>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dialog States
  const [showSettings, setShowSettings] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);

  // Profile Edit Form States
  const [editName, setEditName] = useState(user?.name || '');
  const [editStatus, setEditStatus] = useState(user?.status || '');
  const [editAvatar, setEditAvatar] = useState(user?.avatar || '');
  const [editPhone, setEditPhone] = useState(user?.phone || '');

  // Add Contact Form State
  const [contactQuery, setContactQuery] = useState('');
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSuccess, setContactSuccess] = useState<string | null>(null);

  // Create Group Form States
  const [groupName, setGroupName] = useState('');
  const [groupAvatar, setGroupAvatar] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);

  // Create Channel Form States
  const [channelName, setChannelName] = useState('');
  const [channelAvatar, setChannelAvatar] = useState('');

  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      return 'dark';
    }
    document.documentElement.classList.remove('dark');
    return 'light';
  });

  const toggleTheme = () => {
    if (theme === 'light') {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
      setTheme('dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
      setTheme('light');
    }
  };

  useEffect(() => {
    fetchConversations();
    fetchContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile({ name: editName, status: editStatus, avatar: editAvatar, phone: editPhone });
      setShowSettings(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);
    setContactSuccess(null);
    try {
      const res = await apiClient('/contacts', {
        method: 'POST',
        body: JSON.stringify({ searchQuery: contactQuery }),
      });
      setContactSuccess(res.message || 'Request sent');
      setContactQuery('');
      fetchContacts();
    } catch (err: any) {
      setContactError(err.message);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName) return;
    try {
      const newGroup = await apiClient('/conversations', {
        method: 'POST',
        body: JSON.stringify({
          type: 'GROUP',
          name: groupName,
          avatar: groupAvatar,
          participantIds: selectedContacts,
        }),
      });
      setShowCreateGroup(false);
      setGroupName('');
      setGroupAvatar('');
      setSelectedContacts([]);
      fetchConversations();
      setActiveConversationId(newGroup.id);
      onSelectChat();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName) return;
    try {
      const newChannel = await apiClient('/conversations', {
        method: 'POST',
        body: JSON.stringify({
          type: 'CHANNEL',
          name: channelName,
          avatar: channelAvatar,
        }),
      });
      setShowCreateChannel(false);
      setChannelName('');
      setChannelAvatar('');
      fetchConversations();
      setActiveConversationId(newChannel.id);
      onSelectChat();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectContactChat = async (contactUserId: string) => {
    try {
      const directChat = await apiClient('/conversations', {
        method: 'POST',
        body: JSON.stringify({
          type: 'DIRECT',
          participantIds: [contactUserId],
        }),
      });
      fetchConversations();
      setActiveConversationId(directChat.id);
      setActiveTab('chats');
      onSelectChat();
    } catch (err) {
      console.error(err);
    }
  };

  // Filter conversations based on query
  const filteredConversations = conversations.filter((c) => {
    const name = c.name || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const formatLastMessageTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="w-full md:w-[380px] h-full flex flex-col bg-sidebar-bg dark:bg-sidebar-bg-dark border-r border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
      {/* Sidebar Header */}
      <div className="p-4 bg-header-bg dark:bg-header-bg-dark flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <img 
            src={user?.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user?.name}`} 
            alt="Avatar" 
            className="w-10 h-10 rounded-full border border-zinc-300 dark:border-zinc-700 object-cover"
          />
          <div className="text-left">
            <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-100 leading-tight">{user?.name}</h3>
            <span className="text-xs text-brand-green font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-brand-green rounded-full inline-block animate-pulse" />
              Online
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={toggleTheme} 
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-lg transition-colors cursor-pointer"
            title="Toggle theme"
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>

          <button 
            onClick={() => {
              setShowNotifications(!showNotifications);
              fetchContacts();
            }} 
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-lg transition-colors cursor-pointer relative"
            title="Notifications"
          >
            <Bell className="w-5 h-5" />
            {contacts.filter(c => c.status === 'PENDING_RECEIVED').length > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-bounce">
                {contacts.filter(c => c.status === 'PENDING_RECEIVED').length}
              </span>
            )}
          </button>
          
          <button 
            onClick={() => {
              setEditName(user?.name || '');
              setEditStatus(user?.status || '');
              setEditAvatar(user?.avatar || '');
              setEditPhone(user?.phone || '');
              setShowSettings(true);
            }} 
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-lg transition-colors cursor-pointer"
            title="Profile Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => logout()} 
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-red-500 rounded-lg transition-colors cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Notifications Dropdown */}
      {showNotifications && (
        <>
          <div 
            className="fixed inset-0 z-30" 
            onClick={() => setShowNotifications(false)}
          />
          <div className="absolute top-16 left-4 right-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-2xl shadow-xl p-4 z-40 max-h-[300px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-800 text-left">
              Notifications
            </h4>
            
            {contacts.filter(c => c.status === 'PENDING_RECEIVED').length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-zinc-400 dark:text-zinc-500">
                <Bell className="w-8 h-8 mb-2 opacity-50 text-zinc-400 dark:text-zinc-550" />
                <span className="text-xs">No new notifications</span>
              </div>
            ) : (
              <div className="space-y-3">
                {contacts.filter(c => c.status === 'PENDING_RECEIVED').map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <img 
                        src={c.user.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${c.user.name}`} 
                        className="w-8 h-8 rounded-full object-cover shrink-0" 
                        alt="" 
                      />
                      <div className="text-left">
                        <p className="font-semibold text-zinc-800 dark:text-zinc-200">{c.user.name}</p>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Sent contact request</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={async () => {
                          try {
                            await apiClient(`/contacts/${c.id}/accept`, { method: 'POST' });
                            fetchContacts();
                            fetchConversations();
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors cursor-pointer"
                        title="Accept"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await apiClient(`/contacts/${c.id}`, { method: 'DELETE' });
                            fetchContacts();
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors cursor-pointer"
                        title="Decline"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Tab Select & Add Buttons */}
      <div className="p-3 pb-0 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex bg-zinc-200/60 dark:bg-zinc-800/60 p-0.5 rounded-xl gap-0.5">
            <button
              onClick={() => setActiveTab('chats')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'chats' 
                  ? 'bg-white dark:bg-zinc-700 text-zinc-850 dark:text-white shadow-sm' 
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chats
            </button>
            <button
              onClick={() => {
                setActiveTab('contacts');
                fetchContacts();
              }}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'contacts' 
                  ? 'bg-white dark:bg-zinc-700 text-zinc-850 dark:text-white shadow-sm' 
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Contacts
            </button>
          </div>

          <div className="flex gap-1">
            <button
              onClick={() => setShowAddContact(true)}
              className="p-2 bg-brand-green/10 hover:bg-brand-green/20 text-brand-green dark:text-emerald-400 rounded-xl transition-all cursor-pointer"
              title="Add Contact"
            >
              <Plus className="w-4 h-4" />
            </button>
            
            {activeTab === 'chats' && (
              <>
                <button
                  onClick={() => setShowCreateGroup(true)}
                  className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-550 dark:text-blue-400 rounded-xl transition-all cursor-pointer"
                  title="Create Group"
                >
                  <Users className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowCreateChannel(true)}
                  className="p-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-550 dark:text-purple-400 rounded-xl transition-all cursor-pointer"
                  title="Create Channel"
                >
                  <Radio className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder={activeTab === 'chats' ? "Search chats..." : "Search contacts..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-150/50 dark:bg-zinc-800/50 border border-transparent focus:border-zinc-200 dark:focus:border-zinc-700 outline-none rounded-xl text-sm text-zinc-800 dark:text-zinc-200 transition-all"
          />
        </div>
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {activeTab === 'chats' ? (
          // Chats Tab
          filteredConversations.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-zinc-400 dark:text-zinc-500">
              <MessageSquare className="w-12 h-12 mb-3 stroke-[1.2]" />
              <p className="text-sm">No chats found. Add contacts or create a group to start messaging.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredConversations.map((c) => {
                const isActive = activeConversationId === c.id;
                
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveConversationId(c.id);
                      emitMessageRead(c.id);
                      onSelectChat();
                    }}
                    className={`w-full p-3 flex gap-3 text-left rounded-xl transition-all relative outline-none cursor-pointer ${
                      isActive 
                        ? 'bg-zinc-200/50 dark:bg-zinc-800/50' 
                        : 'hover:bg-zinc-100/50 dark:hover:bg-zinc-800/20'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <img 
                        src={c.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${c.name}`} 
                        alt={c.name || 'Chat'} 
                        className="w-11 h-11 rounded-full object-cover"
                      />
                      {c.type === 'DIRECT' && c.participants.find(p => p.userId !== user?.id)?.user.isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-brand-green border-2 border-sidebar-bg dark:border-sidebar-bg-dark rounded-full" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                        <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-100 truncate pr-2">
                          {c.name || 'Chat'}
                        </h4>
                        {c.lastMessage && (
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                            {formatLastMessageTime(c.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-zinc-550 dark:text-zinc-400 truncate pr-2">
                          {c.lastMessage ? (
                            c.lastMessage.deletedAt ? (
                              <span className="italic text-zinc-400 dark:text-zinc-500">This message was deleted</span>
                            ) : (
                              c.lastMessage.content || 'Attachment sent'
                            )
                          ) : (
                            c.type === 'CHANNEL' ? 'Broadcasting channel' : 'No messages yet'
                          )}
                        </p>
                        
                        {c.unreadCount > 0 && (
                          <span className="px-2 py-0.5 bg-brand-green text-[10px] font-bold text-white rounded-full min-w-[18px] text-center">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : (
          // Contacts Tab
          contacts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-zinc-400 dark:text-zinc-500">
              <Users className="w-12 h-12 mb-3 stroke-[1.2]" />
              <p className="text-sm">No contacts. Click the plus button to add your friends.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="p-3 flex items-center justify-between hover:bg-zinc-100/50 dark:hover:bg-zinc-800/20 rounded-xl"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <img 
                        src={c.user.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${c.user.name}`} 
                        alt={c.user.name} 
                        className="w-11 h-11 rounded-full object-cover"
                      />
                      {c.user.isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-brand-green border-2 border-sidebar-bg dark:border-sidebar-bg-dark rounded-full" />
                      )}
                    </div>
                    
                    <div className="text-left min-w-0">
                      <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-100 truncate">{c.user.name}</h4>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate">{c.user.status || 'No status bio'}</p>
                    </div>
                  </div>

                  <div>
                    {c.status === 'ACCEPTED' ? (
                      <button
                        onClick={() => handleSelectContactChat(c.user.id)}
                        className="px-3 py-1.5 bg-brand-green/10 hover:bg-brand-green/20 text-brand-green dark:text-emerald-400 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                      >
                        Chat
                      </button>
                    ) : c.status === 'PENDING_SENT' ? (
                      <span className="px-2 py-1 bg-amber-500/10 text-amber-550 dark:text-amber-400 text-[10px] font-bold rounded-lg uppercase tracking-wider">
                        Pending
                      </span>
                    ) : c.status === 'PENDING_RECEIVED' ? (
                      <button
                        onClick={async () => {
                          try {
                            await apiClient(`/contacts/${c.id}/accept`, { method: 'PUT' });
                            fetchContacts();
                            fetchConversations();
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="px-3 py-1.5 bg-brand-green text-white hover:bg-brand-green-dark font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                      >
                        Accept
                      </button>
                    ) : (
                      <span className="px-2 py-1 bg-zinc-500/10 text-zinc-550 text-[10px] font-bold rounded-lg uppercase tracking-wider">
                        Blocked
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ================================================================= */}
      {/* DIALOGS / MODALS */}
      {/* ================================================================= */}

      {/* Settings Dialog */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setShowSettings(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Edit Profile Settings</h3>
            
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:border-brand-green outline-none rounded-xl text-sm text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Status About Bio
                </label>
                <input
                  type="text"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:border-brand-green outline-none rounded-xl text-sm text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +1 555-0199"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:border-brand-green outline-none rounded-xl text-sm text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Avatar Image URL
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  value={editAvatar}
                  onChange={(e) => setEditAvatar(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:border-brand-green outline-none rounded-xl text-sm text-zinc-900 dark:text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-brand-green hover:bg-brand-green-dark text-white font-semibold rounded-xl text-sm cursor-pointer"
              >
                Save Updates
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Contact Dialog */}
      {showAddContact && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => {
                setShowAddContact(false);
                setContactError(null);
                setContactSuccess(null);
                setContactQuery('');
              }}
              className="absolute top-4 right-4 p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Add Contact</h3>

            {contactError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-xl flex items-center gap-2">
                <X className="w-4 h-4" />
                <span>{contactError}</span>
              </div>
            )}

            {contactSuccess && (
              <div className="mb-4 p-3 bg-brand-green/10 border border-brand-green/20 text-brand-green text-xs rounded-xl flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>{contactSuccess}</span>
              </div>
            )}
            
            <form onSubmit={handleAddContact} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Search by Email, Display Name, or Phone
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter username/email"
                  value={contactQuery}
                  onChange={(e) => setContactQuery(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:border-brand-green outline-none rounded-xl text-sm text-zinc-900 dark:text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-brand-green hover:bg-brand-green-dark text-white font-semibold rounded-xl text-sm cursor-pointer"
              >
                Send Contact Request
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Create Group Dialog */}
      {showCreateGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 w-full max-w-md shadow-2xl relative max-h-[85vh] flex flex-col">
            <button 
              onClick={() => setShowCreateGroup(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Create Group Chat</h3>
            
            <form onSubmit={handleCreateGroup} className="space-y-4 overflow-y-auto flex-1 pr-1">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Work Squad"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:border-brand-green outline-none rounded-xl text-sm text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Group Avatar URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/avatar.jpg"
                  value={groupAvatar}
                  onChange={(e) => setGroupAvatar(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:border-brand-green outline-none rounded-xl text-sm text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Add Group Members
                </label>
                {contacts.filter(c => c.status === 'ACCEPTED').length === 0 ? (
                  <p className="text-xs text-zinc-400 mt-1">No contacts available to add to the group.</p>
                ) : (
                  <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-xl p-2 bg-zinc-50/50 dark:bg-zinc-950/20">
                    {contacts.filter(c => c.status === 'ACCEPTED').map((c) => {
                      const isSelected = selectedContacts.includes(c.user.id);
                      return (
                        <button
                          type="button"
                          key={c.user.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedContacts(selectedContacts.filter(id => id !== c.user.id));
                            } else {
                              setSelectedContacts([...selectedContacts, c.user.id]);
                            }
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                            isSelected 
                              ? 'bg-brand-green/10 text-brand-green font-semibold' 
                              : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/40 text-zinc-700 dark:text-zinc-350'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <img src={c.user.avatar} className="w-6 h-6 rounded-full object-cover" alt="" />
                            <span>{c.user.name}</span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-brand-green hover:bg-brand-green-dark text-white font-semibold rounded-xl text-sm cursor-pointer"
              >
                Create Group
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Create Channel Dialog */}
      {showCreateChannel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setShowCreateChannel(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Create Broadcast Channel</h3>
            <p className="text-xs text-zinc-400 dark:text-zinc-550 mb-4">
              Channels allow you to broadcast updates to unlimited subscribers. Only admins can write posts.
            </p>
            
            <form onSubmit={handleCreateChannel} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Channel Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tech News Alerts"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:border-brand-green outline-none rounded-xl text-sm text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                  Channel Avatar URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/avatar.jpg"
                  value={channelAvatar}
                  onChange={(e) => setChannelAvatar(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-855 border border-transparent focus:border-brand-green outline-none rounded-xl text-sm text-zinc-850 dark:text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-brand-green hover:bg-brand-green-dark text-white font-semibold rounded-xl text-sm cursor-pointer"
              >
                Create Channel
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
