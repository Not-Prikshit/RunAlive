// apps/mobile/src/components/ChatModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { COLORS, SPACING, RADIUS } from '@/design/tokens';
import { api } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { SocketEvent } from '@runalive/shared';

export interface ChatMessageItem {
  id: string;
  senderDisplayName: string;
  senderRole?: string;
  message: string;
  createdAt: string;
  isMe: boolean;
}

interface ChatModalProps {
  visible: boolean;
  onClose: () => void;
  gameId: string;
  currentUserId?: string;
}

export function ChatModal({
  visible,
  onClose,
  gameId,
  currentUserId,
}: ChatModalProps) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible || !gameId) return;

    // Load initial history
    api
      .get<{ messages: any[] }>(`/parties/${gameId}/chat?limit=50`)
      .then((res) => {
        if (res.data?.messages) {
          setMessages(
            res.data.messages.map((m: any) => ({
              id: m.id,
              senderDisplayName: m.senderDisplayName || 'Player',
              senderRole: m.senderRole || 'RUNNER',
              message: m.message,
              createdAt: m.createdAt,
              isMe: m.senderUserId === currentUserId,
            }))
          );
        }
      })
      .catch(() => {});

    const socket = connectSocket();
    socket.emit('party:join', { partyId: gameId });
    socket.emit('game:join', { gameId });

    const handleMsg = (msg: any) => {
      if (
        msg.partyId === gameId ||
        msg.matchId === gameId ||
        !msg.partyId
      ) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [
            ...prev,
            {
              id: msg.id,
              senderDisplayName: msg.senderDisplayName || 'Player',
              senderRole: msg.senderRole || 'RUNNER',
              message: msg.message,
              createdAt: msg.createdAt,
              isMe: msg.senderUserId === currentUserId,
            },
          ];
        });
      }
    };

    socket.on(SocketEvent.PARTY_CHAT_MESSAGE, handleMsg);
    socket.on('party:chat_message', handleMsg);

    return () => {
      socket.off(SocketEvent.PARTY_CHAT_MESSAGE, handleMsg);
      socket.off('party:chat_message', handleMsg);
    };
  }, [visible, gameId, currentUserId]);

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, visible]);

  const handleSend = async () => {
    const clean = inputText.trim();
    if (!clean || isSending) return;

    setIsSending(true);
    setInputText('');
    try {
      const res = await api.post<{ chat: any }>(`/parties/${gameId}/chat`, {
        message: clean,
        matchId: gameId,
      });
      if (res.data?.chat) {
        const c = res.data.chat;
        setMessages((prev) => {
          if (prev.some((m) => m.id === c.id)) return prev;
          return [
            ...prev,
            {
              id: c.id,
              senderDisplayName: c.senderDisplayName || 'You',
              senderRole: c.senderRole || 'RUNNER',
              message: c.message,
              createdAt: c.createdAt,
              isMe: true,
            },
          ];
        });
      }
    } catch {
      Alert.alert('Error', 'Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalSheet}>
          {/* Header */}
          <View style={styles.modalHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 16 }}>💬</Text>
              <Text style={styles.modalTitle}>Squad Comms</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Messages list */}
          <ScrollView
            ref={scrollRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
          >
            {messages.length === 0 ? (
              <Text style={styles.emptyNote}>
                No transmissions yet. Send a radio dispatch to coordinate with your squad!
              </Text>
            ) : (
              messages.map((m) => (
                <View
                  key={m.id}
                  style={[
                    styles.messageBubble,
                    m.isMe ? styles.myMessage : styles.theirMessage,
                  ]}
                >
                  <Text
                    style={[
                      styles.senderName,
                      { color: m.isMe ? '#000' : COLORS.textSecondary },
                    ]}
                  >
                    {m.senderDisplayName} ({m.senderRole})
                  </Text>
                  <Text style={[styles.messageText, { color: m.isMe ? '#000' : COLORS.text }]}>
                    {m.message}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>

          {/* Input field */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputField}
              placeholder="Radio transmission..."
              placeholderTextColor={COLORS.textMuted}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={isSending || !inputText.trim()}
              style={[
                styles.sendBtn,
                (isSending || !inputText.trim()) && styles.sendBtnDisabled,
              ]}
              activeOpacity={0.8}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.sendBtnText}>SEND</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACING.lg,
    maxHeight: '80%',
    height: 480,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: SPACING.xs,
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  messagesContainer: {
    flex: 1,
    marginVertical: SPACING.sm,
  },
  messagesContent: {
    paddingVertical: SPACING.xs,
  },
  emptyNote: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginVertical: SPACING.xxl,
    fontStyle: 'italic',
  },
  messageBubble: {
    marginBottom: SPACING.sm,
    maxWidth: '85%',
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.accent,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surfaceRaised,
  },
  senderName: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 2,
  },
  messageText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
    paddingTop: SPACING.xs,
  },
  inputField: {
    flex: 1,
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sendBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
