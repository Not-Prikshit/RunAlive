import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { colyseus } from '../lib/colyseus';
import {
  MessageSquare,
  Megaphone,
  Send,
  AlertTriangle,
  Radio,
  Flame,
  CheckCircle2,
  Users,
  Shield,
  Crosshair,
  Crown,
} from 'lucide-react';
import {
  SocketEvent,
  type PartyChatMessage,
  type PartyAnnouncement,
  PlayerRole,
} from '@runalive/shared';

interface PartyCommunicationPanelProps {
  partyId: string;
  currentUserId: string;
  isHost: boolean;
  matchId?: string;
  className?: string;
}

export const PartyCommunicationPanel: React.FC<PartyCommunicationPanelProps> = ({
  partyId,
  currentUserId,
  isHost,
  matchId,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<'CHAT' | 'ANNOUNCEMENTS'>('CHAT');
  const [messages, setMessages] = useState<PartyChatMessage[]>([]);
  const [announcements, setAnnouncements] = useState<PartyAnnouncement[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [announcementInput, setAnnouncementInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [unreadAnnouncementCount, setUnreadAnnouncementCount] = useState(0);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const announcementScrollRef = useRef<HTMLDivElement>(null);

  // Fetch initial history
  useEffect(() => {
    let mounted = true;
    api
      .get<{ messages: PartyChatMessage[] }>(`/parties/${partyId}/chat?limit=50`)
      .then((res) => {
        if (mounted && res.messages) {
          setMessages(res.messages);
        }
      })
      .catch(() => {});

    api
      .get<{ announcements: PartyAnnouncement[] }>(`/parties/${partyId}/announcements?limit=50`)
      .then((res) => {
        if (mounted && res.announcements) {
          setAnnouncements(res.announcements);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [partyId]);

  // Real-time socket event listeners
  useEffect(() => {
    const socket = connectSocket();

    const joinRooms = () => {
      socket.emit('party:join', { partyId });
      socket.emit('game:join', { gameId: partyId });
    };

    joinRooms();
    socket.on('connect', joinRooms);

    const handleNewMessage = (msg: PartyChatMessage) => {
      if (
        msg.partyId === partyId ||
        (matchId && msg.matchId === matchId) ||
        msg.matchId === partyId
      ) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        if (activeTab !== 'CHAT') {
          setUnreadChatCount((c) => c + 1);
        }
      }
    };

    const handleNewAnnouncement = (ann: PartyAnnouncement) => {
      if (
        ann.partyId === partyId ||
        (matchId && ann.matchId === matchId) ||
        ann.matchId === partyId
      ) {
        setAnnouncements((prev) => {
          if (prev.some((a) => a.id === ann.id)) return prev;
          return [...prev, ann];
        });
        if (activeTab !== 'ANNOUNCEMENTS') {
          setUnreadAnnouncementCount((c) => c + 1);
        }
      }
    };

    socket.on(SocketEvent.PARTY_CHAT_MESSAGE, handleNewMessage);
    socket.on('party:chat_message', handleNewMessage);
    socket.on(SocketEvent.PARTY_ANNOUNCEMENT, handleNewAnnouncement);
    socket.on('party:announcement', handleNewAnnouncement);

    // Colyseus Authoritative Room Subscription
    const room = colyseus.getCurrentRoom();
    const handleStateChange = (state: any) => {
      if (state.messages && state.messages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs: PartyChatMessage[] = [];
          state.messages.forEach((m: any) => {
            if (m.id && !existingIds.has(m.id) && !m.isAnnouncement) {
              newMsgs.push({
                id: m.id,
                partyId: partyId,
                matchId: matchId || partyId,
                senderUserId: m.senderId,
                senderDisplayName: m.senderName,
                senderAvatarUrl: m.senderAvatarUrl || null,
                senderRole: m.senderRole,
                message: m.message,
                createdAt: new Date(m.timestamp).toISOString(),
              });
            }
          });
          if (newMsgs.length === 0) return prev;
          return [...prev, ...newMsgs];
        });
      }
    };

    if (room) {
      room.onStateChange(handleStateChange);
    }

    return () => {
      socket.off('connect', joinRooms);
      socket.off(SocketEvent.PARTY_CHAT_MESSAGE, handleNewMessage);
      socket.off('party:chat_message', handleNewMessage);
      socket.off(SocketEvent.PARTY_ANNOUNCEMENT, handleNewAnnouncement);
      socket.off('party:announcement', handleNewAnnouncement);
      if (room) {
        room.onStateChange.remove(handleStateChange);
      }
    };
  }, [partyId, matchId, activeTab]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (activeTab === 'CHAT' && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  useEffect(() => {
    if (activeTab === 'ANNOUNCEMENTS' && announcementScrollRef.current) {
      announcementScrollRef.current.scrollTop = announcementScrollRef.current.scrollHeight;
    }
  }, [announcements, activeTab]);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = chatInput.trim();
    if (!clean || isSending) return;

    setIsSending(true);
    setChatInput('');

    // Optimistic UI append for instant response
    const optimisticId = 'opt-' + Date.now();
    const optimisticMsg: PartyChatMessage = {
      id: optimisticId,
      partyId,
      matchId: matchId || partyId,
      senderUserId: currentUserId,
      senderDisplayName: 'You',
      senderAvatarUrl: null,
      senderRole: isHost ? PlayerRole.HOST : PlayerRole.RUNNER,
      message: clean,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      // 1. Authoritative Colyseus real-time broadcast
      const room = colyseus.getCurrentRoom();
      if (room) {
        room.send('chat:send', { message: clean });
      }

      // 2. Persistent REST & Socket.IO sync
      const res = await api.post<{ chat: PartyChatMessage }>(`/parties/${partyId}/chat`, {
        message: clean,
        matchId: matchId || partyId,
      });
      if (res?.chat) {
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== optimisticId);
          if (filtered.some((m) => m.id === res.chat.id)) return filtered;
          return [...filtered, res.chat];
        });
      }
    } catch (err: any) {
      console.warn('Chat send error:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = announcementInput.trim();
    if (!clean || isSending) return;

    setIsSending(true);
    setAnnouncementInput('');
    try {
      // 1. Authoritative Colyseus host announcement broadcast
      const room = colyseus.getCurrentRoom();
      if (room) {
        room.send('host:announcement', { title: 'COMMAND', body: clean });
      }

      // 2. Persistent REST & Socket.IO sync
      const res = await api.post<{ announcement: PartyAnnouncement }>(`/parties/${partyId}/announcements`, {
        message: clean,
        type: 'HOST',
        matchId: matchId || partyId,
      });
      if (res?.announcement) {
        setAnnouncements((prev) => {
          if (prev.some((a) => a.id === res.announcement.id)) return prev;
          return [...prev, res.announcement];
        });
      }
    } catch (err: any) {
      console.warn('Announcement send error:', err);
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div
      className={`comic-card bg-white dark:bg-[#1E293B] border-2 border-[#0F172A] dark:border-[#475569] rounded-2xl flex flex-col shadow-[4px_4px_0px_#0F172A] dark:shadow-[4px_4px_0px_#020617] overflow-hidden ${className}`}
    >
      {/* Tab Switcher */}
      <div className="flex border-b-2 border-[#0F172A] dark:border-[#475569] bg-[#FAF8F5] dark:bg-[#0F172A]">
        <button
          type="button"
          onClick={() => {
            setActiveTab('CHAT');
            setUnreadChatCount(0);
          }}
          className={`flex-1 py-2.5 px-3 flex items-center justify-center space-x-2 font-heading font-black text-xs uppercase tracking-wider transition ${
            activeTab === 'CHAT'
              ? 'bg-white dark:bg-[#1E293B] text-[#2563EB] dark:text-[#93C5FD] border-b-2 border-[#2563EB]'
              : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-white'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Squad Chat</span>
          {unreadChatCount > 0 && (
            <span className="bg-[#EF4444] text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full">
              {unreadChatCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('ANNOUNCEMENTS');
            setUnreadAnnouncementCount(0);
          }}
          className={`flex-1 py-2.5 px-3 flex items-center justify-center space-x-2 font-heading font-black text-xs uppercase tracking-wider transition ${
            activeTab === 'ANNOUNCEMENTS'
              ? 'bg-white dark:bg-[#1E293B] text-[#FBBC04] dark:text-[#FDE68A] border-b-2 border-[#FBBC04]'
              : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-white'
          }`}
        >
          <Megaphone className="w-4 h-4" />
          <span>Notice Board</span>
          {unreadAnnouncementCount > 0 && (
            <span className="bg-[#FBBC04] text-[#0F172A] text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold">
              {unreadAnnouncementCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab Body: CHAT */}
      {activeTab === 'CHAT' && (
        <div className="flex-1 flex flex-col min-h-[280px] max-h-[360px]">
          <div ref={chatScrollRef} className="flex-1 p-3 overflow-y-auto space-y-2.5 text-xs font-sans">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#94A3B8]">
                <MessageSquare className="w-8 h-8 mb-2 stroke-[1.5]" />
                <span className="font-heading font-bold text-xs uppercase">Radio Silence</span>
                <span className="text-[11px] font-mono mt-0.5">Drop a message to coordinate with the squad.</span>
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.senderUserId === currentUserId;
                const isSeeker = m.senderRole === PlayerRole.SEEKER;
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center space-x-1.5 mb-0.5">
                      <span className="font-heading font-black text-[11px] text-[#0F172A] dark:text-white">
                        {isMe ? 'You' : m.senderDisplayName}
                      </span>
                      <span
                        className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                          isSeeker
                            ? 'bg-[#FEE2E2] text-[#DC2626] border-[#EF4444]'
                            : 'bg-[#EFF6FF] text-[#2563EB] border-[#3B82F6]'
                        }`}
                      >
                        {isSeeker ? 'SEEKER' : 'HIDER'}
                      </span>
                      <span className="text-[9px] font-mono text-[#94A3B8]">
                        {formatTime(m.createdAt)}
                      </span>
                    </div>
                    <div
                      className={`max-w-[85%] px-3 py-1.5 rounded-xl border-2 text-xs break-words shadow-[1.5px_1.5px_0px_#0F172A] dark:shadow-[1.5px_1.5px_0px_#020617] ${
                        isMe
                          ? 'bg-[#E8F0FE] text-[#0F172A] border-[#2563EB]'
                          : 'bg-[#FAF8F5] dark:bg-[#0F172A] text-[#0F172A] dark:text-[#F8FAFC] border-[#0F172A] dark:border-[#475569]'
                      }`}
                    >
                      {m.message}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Chat Form */}
          <form
            onSubmit={handleSendChat}
            className="p-2 border-t-2 border-[#0F172A] dark:border-[#475569] bg-[#FAF8F5] dark:bg-[#0F172A] flex items-center space-x-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Transmit tactical message..."
              maxLength={500}
              className="flex-1 bg-white dark:bg-[#1E293B] border-2 border-[#0F172A] dark:border-[#475569] rounded-xl px-3 py-1.5 text-xs font-sans text-[#0F172A] dark:text-white outline-none focus:border-[#2563EB] transition"
            />
            <button
              type="submit"
              disabled={isSending || !chatInput.trim()}
              className="p-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl border-2 border-[#0F172A] shadow-[2px_2px_0px_#0F172A] disabled:opacity-50 active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Tab Body: ANNOUNCEMENTS */}
      {activeTab === 'ANNOUNCEMENTS' && (
        <div className="flex-1 flex flex-col min-h-[280px] max-h-[360px]">
          <div
            ref={announcementScrollRef}
            className="flex-1 p-3 overflow-y-auto space-y-2 text-xs font-sans"
          >
            {announcements.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#94A3B8]">
                <Megaphone className="w-8 h-8 mb-2 stroke-[1.5]" />
                <span className="font-heading font-bold text-xs uppercase">No Broadcasts Yet</span>
                <span className="text-[11px] font-mono mt-0.5">System and Host alerts will pin here.</span>
              </div>
            ) : (
              announcements.map((a) => {
                const isHostType = a.announcementType === 'HOST';
                const isWarn = a.announcementType === 'WARNING';
                const isElim = a.announcementType === 'ELIMINATION';

                return (
                  <div
                    key={a.id}
                    className={`p-2.5 rounded-xl border-2 text-xs shadow-[2px_2px_0px_#0F172A] dark:shadow-[2px_2px_0px_#020617] ${
                      isElim
                        ? 'bg-[#FFF1F2] border-[#EF4444] text-[#991B1B]'
                        : isHostType
                        ? 'bg-[#FEF7E0] border-[#FBBC04] text-[#92400E]'
                        : isWarn
                        ? 'bg-[#FFFBEB] border-[#F59E0B] text-[#B45309]'
                        : 'bg-[#F0FDF4] border-[#10B981] text-[#065F46]'
                    }`}
                  >
                    <div className="flex items-center justify-between font-heading font-bold text-[10px] uppercase mb-1">
                      <span className="flex items-center space-x-1">
                        {isHostType && <Crown className="w-3 h-3 text-[#FBBC04]" />}
                        {isElim && <Crosshair className="w-3 h-3 text-[#EF4444]" />}
                        {!isHostType && !isElim && <Radio className="w-3 h-3" />}
                        <span>
                          {isHostType
                            ? `HOST DISPATCH • ${a.senderDisplayName || 'COMMAND'}`
                            : `${a.announcementType} LOG`}
                        </span>
                      </span>
                      <span className="font-mono text-[9px]">{formatTime(a.createdAt)}</span>
                    </div>
                    <div className="font-sans font-bold leading-relaxed">{a.message}</div>
                  </div>
                );
              })
            )}
          </div>

          {/* Host Broadcast Form (Host only) */}
          {isHost && (
            <form
              onSubmit={handleSendAnnouncement}
              className="p-2 border-t-2 border-[#0F172A] dark:border-[#475569] bg-[#FEF7E0] dark:bg-[#78350F]/40 flex items-center space-x-2"
            >
              <input
                type="text"
                value={announcementInput}
                onChange={(e) => setAnnouncementInput(e.target.value)}
                placeholder="Broadcast host announcement to all players..."
                maxLength={500}
                className="flex-1 bg-white dark:bg-[#1E293B] border-2 border-[#0F172A] dark:border-[#475569] rounded-xl px-3 py-1.5 text-xs font-sans text-[#0F172A] dark:text-white outline-none focus:border-[#FBBC04] transition"
              />
              <button
                type="submit"
                disabled={isSending || !announcementInput.trim()}
                className="py-1.5 px-3 bg-[#FBBC04] hover:bg-[#F59E0B] text-[#0F172A] font-heading font-black text-xs uppercase rounded-xl border-2 border-[#0F172A] shadow-[2px_2px_0px_#0F172A] disabled:opacity-50 active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer flex items-center space-x-1"
              >
                <Megaphone className="w-3.5 h-3.5" />
                <span>Alert</span>
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
