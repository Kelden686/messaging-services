import React, { useEffect, useState } from 'react';
import { useAuthStore } from './store/useAuthStore';
import { useChatStore, Conversation } from './store/useChatStore';
import { useSocketStore } from './store/useSocketStore';
import { AuthPage } from './pages/AuthPage';
import { Sidebar } from './components/Chat/Sidebar';
import { ChatWindow } from './components/Chat/ChatWindow';
import { RightPane } from './components/Chat/RightPane';
import { Lock, MessageSquare } from 'lucide-react';
import { apiClient } from './utils/apiClient';

function App() {
  const { isAuthenticated, isCheckingAuth, checkAuth, user } = useAuthStore();
  const { activeConversationId, conversations, setConversations, setActiveConversationId } = useChatStore();
  const { connectSocket, disconnectSocket } = useSocketStore();

  const [showInfo, setShowInfo] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Run initial Auth session validation on mount
  useEffect(() => {
    checkAuth();

    // Initialize Theme class
    const isDark = localStorage.theme === 'dark' || 
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
    }

    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connect/Disconnect Socket depending on authentication
  useEffect(() => {
    if (isAuthenticated) {
      connectSocket();
    } else {
      disconnectSocket();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleRefreshChat = async () => {
    if (!activeConversationId) return;
    try {
      // Refresh current conversation participants details
      const activeData = await apiClient(`/conversations/${activeConversationId}`);
      const updatedConvs = conversations.map((c) => (c.id === activeConversationId ? activeData : c));
      setConversations(updatedConvs);
    } catch (err) {
      console.error(err);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 transition-colors duration-300">
        <div className="relative flex flex-col items-center animate-pulse">
          {/* Logo animation */}
          <div className="p-4 bg-brand-green/10 text-brand-green rounded-3xl mb-4 border border-brand-green/20">
            <svg className="w-14 h-14" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.011 2.29c-5.358 0-9.702 4.343-9.702 9.7 0 2.05.635 3.96 1.725 5.54L2.39 22l4.896-1.282c1.517.827 3.25 1.298 5.093 1.298 5.358 0 9.702-4.343 9.702-9.7 0-5.36-4.343-9.7-9.7-9.701zm0 17.766c-1.848 0-3.578-.495-5.075-1.36l-.364-.216-3.032.795.808-2.95-.236-.377a8.03 8.03 0 01-1.233-4.22c0-4.437 3.611-8.048 8.048-8.048 4.436 0 8.047 3.612 8.047 8.05-.004 4.435-3.612 8.046-8.058 8.046z"/>
            </svg>
          </div>
          <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-200">Messaging Hub</h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Connecting to secure servers...</p>
        </div>
        
        <div className="absolute bottom-8 flex items-center gap-1.5 text-zinc-400 text-[10px] font-semibold tracking-wider uppercase">
          <Lock className="w-3.5 h-3.5" />
          End-to-End Encrypted
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  // Find currently active conversation details
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  return (
    <div className="h-screen w-screen flex bg-zinc-100 dark:bg-zinc-950 overflow-hidden text-zinc-900 dark:text-white transition-colors duration-300">
      {isMobile ? (
        // Mobile Layout (Single Column toggle view)
        <div className="w-full h-full relative">
          {!activeConversationId ? (
            <Sidebar onSelectChat={() => {}} />
          ) : (
            <div className="w-full h-full flex">
              {showInfo && activeConversation ? (
                <RightPane 
                  conversation={activeConversation}
                  onClose={() => setShowInfo(false)}
                  onRefreshChat={handleRefreshChat}
                />
              ) : (
                <ChatWindow 
                  onToggleInfo={() => setShowInfo(true)}
                  onBack={() => {
                    setActiveConversationId(null);
                    setShowInfo(false);
                  }}
                />
              )}
            </div>
          )}
        </div>
      ) : (
        // Desktop Layout (Split-pane layout)
        <div className="w-full h-full flex">
          {/* 1. Left Sidebar */}
          <Sidebar onSelectChat={() => {}} />

          {/* 2. Middle Chat view */}
          <div className="flex-1 h-full flex">
            {activeConversationId ? (
              <ChatWindow 
                onToggleInfo={() => setShowInfo(!showInfo)}
                onBack={() => {}}
              />
            ) : (
              // Desktop placeholder screen
              <div className="flex-1 h-full flex flex-col items-center justify-center bg-white dark:bg-zinc-900/40 p-8 text-center select-none relative transition-colors duration-300">
                <div 
                  className="absolute inset-0 opacity-[0.03] dark:opacity-[0.01]"
                  style={{
                    backgroundImage: `url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')`,
                    backgroundSize: '360px',
                  }}
                />
                
                <div className="max-w-md flex flex-col items-center z-10">
                  <div className="p-5 bg-brand-green/5 text-brand-green dark:text-emerald-400 rounded-full mb-5 border border-brand-green/10">
                    <MessageSquare className="w-16 h-16 stroke-[1.25]" />
                  </div>
                  <h2 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">Messaging Web Client</h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-sm">
                    Send and receive messages instantly in real-time. Link contacts, establish groups, or broadcast in channels.
                  </p>
                </div>

                <div className="absolute bottom-8 flex items-center gap-1.5 text-zinc-400 dark:text-zinc-650 text-[10px] font-bold tracking-wider uppercase z-10">
                  <Lock className="w-3.5 h-3.5" />
                  End-to-End Encrypted
                </div>
              </div>
            )}

            {/* 3. Right Sidebar Drawer (Collapsible) */}
            {showInfo && activeConversation && (
              <RightPane 
                conversation={activeConversation}
                onClose={() => setShowInfo(false)}
                onRefreshChat={handleRefreshChat}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
