import { Bookmark, Camera, ChevronLeft, Forward as ForwardIcon, Gift, LockKeyhole, Mic, Paperclip, Pencil, Search, Send, Smile, Sparkles, Square, Trash2, UsersRound, X } from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, apiRawRequest, apiRequest, mediaUrl } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { attachmentDigest, decryptForDevice, encryptAttachment, encryptForDevice, getOrCreateIdentity, type DeviceIdentity } from '../messaging/crypto';
import { parseMessageContent, type BasicMessageContent, type EncryptedMessagePayload, type MessageContent } from '../messaging/message-content';
import { getSticker, STICKERS, type StickerId } from '../messaging/stickers';
import { formatMessageDay, messageDayKey } from '../messaging/message-day';
import { EncryptedMessageImage } from '../components/EncryptedMessageImage';
import { EncryptedMessageAudio } from '../components/EncryptedMessageAudio';
import { EncryptedMessageVideo } from '../components/EncryptedMessageVideo';
import { MessengerAiChat } from '../components/MessengerAiChat';

const STANDARD_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_VOICE_DURATION_MS = 10 * 60 * 1000;
const MAX_VIDEO_DURATION_MS = 60 * 1000;
const AUDIO_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'] as const;
const TYSON_AI_CHAT_ID = 'tyson-ai';

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

interface Conversation {
  id: string;
  updatedAt: string;
  otherUserId: string;
  otherUsername: string;
  otherDisplayName: string;
  otherAvatarKey: string | null;
  otherVerified: number | boolean;
  isSaved: boolean;
  securityMode: 'cloud' | 'secret';
  kind?: 'direct' | 'group';
  memberCount?: number;
}

interface PublicDevice { deviceId: string; name: string; publicKey: string }
interface EncryptedMessage { id: string; senderUserId: string; senderDeviceId: string; ciphertext: string; sentAt: string; editedAt?: string | null }
interface PlainMessage extends EncryptedMessage { content: MessageContent }
interface CloudMessage { id: string; senderUserId: string; sentAt: string; editedAt?: string | null; content: unknown }
interface MessageMenuState { message: PlainMessage; x: number; y: number }
interface FollowedPerson { id: string; username: string; displayName: string; avatarKey: string | null; verified: number | boolean }
interface MessageSearchResult { id: string; conversationId: string; senderUserId: string; sentAt: string; excerpt: string }

function basicContent(content: MessageContent): BasicMessageContent {
  return content.type === 'forwarded' ? content.content : content;
}

function attachmentIdFromMessage(content: MessageContent): string | undefined {
  const value = basicContent(content);
  return value.type === 'image' || value.type === 'audio' || value.type === 'video' ? value.attachmentId : undefined;
}

function MessageBody({ content }: { content: MessageContent }) {
  const value = basicContent(content);
  const sticker = value.type === 'sticker' ? getSticker(value.stickerId) : null;
  return <>
    {content.type === 'forwarded' && <span className="forwarded-message-label"><ForwardIcon size={13} />Переслано от {content.fromDisplayName}</span>}
    {value.type === 'text' ? <p>{value.text}</p>
      : value.type === 'support_notice' ? <div className="support-notice-message"><p>{value.text}</p><Link className="support-notice-button" to="/support">Написать в поддержку</Link></div>
      : sticker ? <img className="message-sticker" src={sticker.src} alt={sticker.accessibleLabel} />
          : value.type === 'post' ? <Link className="shared-post-message" to={`/post/${value.postId}`}><strong>Публикация Tyson</strong><span>Открыть публикацию</span></Link>
            : value.type === 'comment' ? <Link className="shared-post-message" to={`/post/${value.postId}`}><strong>Комментарий Tyson</strong><span>Открыть обсуждение</span></Link>
              : value.type === 'gift' ? <div className="shared-post-message gift-message"><img src={value.image} alt="" /><strong>{value.title}</strong><span>{value.inscription || 'Подарок Tyson'}</span></div>
          : value.type === 'image' ? <EncryptedMessageImage attachmentId={value.attachmentId} encryptionKey={value.key} nonce={value.nonce} digest={value.digest} mimeType={value.mimeType} />
            : value.type === 'audio' ? <EncryptedMessageAudio attachmentId={value.attachmentId} encryptionKey={value.key} nonce={value.nonce} digest={value.digest} mimeType={value.mimeType} />
              : value.type === 'video' ? <EncryptedMessageVideo attachmentId={value.attachmentId} encryptionKey={value.key} nonce={value.nonce} digest={value.digest} mimeType={value.mimeType} /> : null}
  </>;
}

export function MessagesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PlainMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [followedPeople, setFollowedPeople] = useState<FollowedPerson[]>([]);
  const [messageResults, setMessageResults] = useState<MessageSearchResult[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupUsername, setGroupUsername] = useState('');
  const [groupMemberUsername, setGroupMemberUsername] = useState('');
  const [groupMemberAdmin, setGroupMemberAdmin] = useState(false);
  const [showGroupCreator, setShowGroupCreator] = useState(false);
  const [secretChatsEnabled, setSecretChatsEnabled] = useState(false);
  const [messageSoundsEnabled, setMessageSoundsEnabled] = useState(true);
  const [startSecretChat, setStartSecretChat] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showGifts, setShowGifts] = useState(false);
  const [giftTypes, setGiftTypes] = useState<Array<{ id: string; title: string; basePrice: number; baseImage: string; remaining: number; canTransfer: boolean }>>([]);
  const [giftInscription, setGiftInscription] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<PlainMessage | null>(null);
  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<PlainMessage | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingKind, setRecordingKind] = useState<'audio' | 'video'>('audio');
  const [remoteActivity, setRemoteActivity] = useState<'typing' | 'recording_audio' | 'recording_video' | null>(null);
  const [maxUploadBytes, setMaxUploadBytes] = useState(STANDARD_UPLOAD_BYTES);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const messageEnd = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const draftInput = useRef<HTMLTextAreaElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);
  const voiceChunks = useRef<Blob[]>([]);
  const voiceBytes = useRef(0);
  const recordingStartedAt = useRef(0);
  const recordingTimer = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const knownMessageIds = useRef(new Set<string>());
  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const sharedPostId = searchParams.get('sharePost');
  const sharedCommentId = searchParams.get('shareComment');
  const sharedCommentPostId = searchParams.get('post');
  const messageDraftKey = activeId && activeId !== TYSON_AI_CHAT_ID ? `tyson:message-draft:${user?.id ?? 'guest'}:${activeId}` : null;

  useEffect(() => {
    if (!active || active.isSaved) { setRemoteActivity(null); return; }
    const load = () => void apiRequest<{ activity: typeof remoteActivity }>(`/messages/conversations/${active.id}/activity`).then((result) => setRemoteActivity(result.activity)).catch(() => setRemoteActivity(null));
    load(); const timer = window.setInterval(load, 3_000); return () => window.clearInterval(timer);
  }, [active?.id, active?.isSaved]);
  useEffect(() => {
    if (!active || active.isSaved) return;
    const activity = recording ? (recordingKind === 'video' ? 'recording_video' : 'recording_audio') : draft.trim() ? 'typing' : null;
    void apiRequest(`/messages/conversations/${active.id}/activity`, { method: 'PUT', body: JSON.stringify({ activity }) }).catch(() => undefined);
  }, [active?.id, active?.isSaved, draft, recording, recordingKind]);

  const loadConversations = useCallback(async () => {
    const result = await apiRequest<{ conversations: Conversation[] }>('/messages/conversations');
    setConversations(result.conversations);
    const requested = searchParams.get('conversation');
    setActiveId((current) => requested === TYSON_AI_CHAT_ID || (requested && result.conversations.some((item) => item.id === requested))
      ? requested
      : current ?? (window.matchMedia('(min-width: 761px)').matches ? result.conversations[0]?.id ?? null : null));
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    void getOrCreateIdentity(user.id).then(async (nextIdentity) => {
      setIdentity(nextIdentity);
      await apiRequest('/messages/devices', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: nextIdentity.deviceId,
          name: `Браузер ${navigator.platform || 'Tyson'}`.slice(0, 80),
          publicKey: nextIdentity.publicKey,
        }),
      });
      await loadConversations();
    }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Не удалось подготовить защищённое устройство.'));
  }, [user, loadConversations]);

  useEffect(() => {
    if (!user) return;
    void apiRequest<{ secretChatEnabled: boolean }>('/users/me/messaging-settings')
      .then(({ secretChatEnabled }) => { setSecretChatsEnabled(secretChatEnabled); setStartSecretChat(false); })
      .catch(() => setSecretChatsEnabled(false));
  }, [user]);

  useEffect(() => { if (user) void apiRequest<{ messageSoundsEnabled: boolean }>('/users/me/notification-settings')
    .then((value) => setMessageSoundsEnabled(value.messageSoundsEnabled)).catch(() => setMessageSoundsEnabled(true)); }, [user]);

  useEffect(() => {
    if (!user) return;
    void apiRequest<{ maxBytes: number }>('/messages/upload-limit')
      .then(({ maxBytes }) => setMaxUploadBytes(maxBytes))
      .catch(() => setMaxUploadBytes(STANDARD_UPLOAD_BYTES));
  }, [user]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!user || !query) { setFollowedPeople([]); return; }
    const timer = window.setTimeout(() => { void apiRequest<{ people: FollowedPerson[] }>(`/messages/following?q=${encodeURIComponent(query)}`).then(({ people }) => setFollowedPeople(people)).catch(() => setFollowedPeople([])); }, 120);
    return () => window.clearTimeout(timer);
  }, [searchQuery, user]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) { setMessageResults([]); return; }
    const timer = window.setTimeout(() => { void apiRequest<{ messages: MessageSearchResult[] }>(`/messages/search?q=${encodeURIComponent(query)}`).then(({ messages }) => setMessageResults(messages)).catch(() => setMessageResults([])); }, 220);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => () => {
    if (recordingTimer.current !== null) window.clearInterval(recordingTimer.current);
    if (recorder.current && recorder.current.state !== 'inactive') {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    microphoneStream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const loadMessages = useCallback(async () => {
    if (!activeId || activeId === TYSON_AI_CHAT_ID || !identity || busy.current) return;
    busy.current = true;
    try {
      const path = active?.securityMode === 'secret'
        ? `/messages/conversations/${activeId}/messages?deviceId=${identity.deviceId}`
        : `/messages/conversations/${activeId}/messages`;
      const result = await apiRequest<{ securityMode: 'cloud' | 'secret'; messages: EncryptedMessage[] | CloudMessage[] }>(path);
      const notifyAboutNewIncoming = (next: PlainMessage[]) => {
        const hadMessages = knownMessageIds.current.size > 0;
        const incoming = next.some((message) => message.senderUserId !== user?.id && !knownMessageIds.current.has(message.id));
        knownMessageIds.current = new Set(next.map((message) => message.id));
        if (!hadMessages || !incoming || !messageSoundsEnabled || document.documentElement.dataset.powerSaving === 'true' || document.visibilityState !== 'visible') return;
        const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        const context = new AudioContextClass(); const oscillator = context.createOscillator(); const gain = context.createGain();
        oscillator.frequency.value = 740; gain.gain.setValueAtTime(0.035, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
        oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.12); oscillator.onended = () => void context.close();
      };
      if (result.securityMode === 'cloud') {
        const next = (result.messages as CloudMessage[]).map((message): PlainMessage => {
          try { return { ...message, senderDeviceId: '', ciphertext: '', content: parseMessageContent(message.content) }; }
          catch { return { ...message, senderDeviceId: '', ciphertext: '', content: { type: 'text' as const, text: 'Не удалось прочитать сообщение.' } }; }
        });
        notifyAboutNewIncoming(next); setMessages(next);
        return;
      }
      const decrypted = await Promise.all((result.messages as EncryptedMessage[]).map(async (message): Promise<PlainMessage> => {
        try {
          const payload = JSON.parse(await decryptForDevice(message.ciphertext, identity)) as unknown;
          return { ...message, content: parseMessageContent(payload) };
        } catch {
          return { ...message, content: { type: 'text', text: 'Не удалось расшифровать сообщение на этом устройстве.' } };
        }
      }));
      notifyAboutNewIncoming(decrypted); setMessages(decrypted);
    } finally {
      busy.current = false;
    }
  }, [active?.securityMode, activeId, identity, messageSoundsEnabled, user?.id]);

  useEffect(() => {
    setShowStickers(false);
    setMessageMenu(null);
    setEditingMessage(null);
    setForwardingMessage(null);
    try { setDraft(messageDraftKey ? localStorage.getItem(messageDraftKey) ?? '' : ''); } catch { setDraft(''); }
    knownMessageIds.current = new Set();
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(), 4000);
    return () => window.clearInterval(timer);
  }, [loadMessages, messageDraftKey]);

  useEffect(() => {
    if (!messageDraftKey) return;
    try { if (draft) localStorage.setItem(messageDraftKey, draft); else localStorage.removeItem(messageDraftKey); } catch { /* local drafts are optional */ }
  }, [draft, messageDraftKey]);

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ block: 'end' });
  }, [activeId, messages.length]);

  useEffect(() => {
    const input = draftInput.current;
    if (!input) return;
    if (!window.matchMedia('(max-width: 760px)').matches) {
      input.style.removeProperty('height');
      input.style.removeProperty('overflow-y');
      return;
    }
    input.style.height = '40px';
    const nextHeight = Math.min(94, Math.max(40, input.scrollHeight));
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > 94 ? 'auto' : 'hidden';
  }, [draft]);

  const openConversation = async (recipientUsername: string) => {
    setError(null);
    try {
      const result = await apiRequest<{ conversation: { id: string } }>('/messages/conversations', {
        method: 'POST',
        body: JSON.stringify({ recipientUsername, securityMode: startSecretChat ? 'secret' : 'cloud' }),
      });
      setSearchQuery('');
      await loadConversations();
      setActiveId(result.conversation.id);
      setSearchParams(sharedPostId ? { conversation: result.conversation.id, sharePost: sharedPostId } : { conversation: result.conversation.id });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось начать разговор.');
    }
  };

  const startGroup = async (event: FormEvent) => {
    event.preventDefault(); setError(null);
    try { const result = await apiRequest<{ conversation: { id: string } }>('/messages/groups', { method: 'POST', body: JSON.stringify({ title: groupTitle, username: groupUsername.replace(/^@/u, '').toLowerCase() }) }); setGroupTitle(''); setGroupUsername(''); setShowGroupCreator(false); await loadConversations(); setActiveId(result.conversation.id); setSearchParams({ conversation: result.conversation.id }); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось создать группу.'); }
  };

  const addGroupMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!active || active.kind !== 'group') return;
    try {
      await apiRequest(`/messages/groups/${active.id}/members`, { method: 'POST', body: JSON.stringify({ usernames: [groupMemberUsername.replace(/^@/u, '').toLowerCase()], role: groupMemberAdmin ? 'admin' : 'member' }) });
      setGroupMemberUsername(''); setGroupMemberAdmin(false); await loadConversations();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось добавить участника.'); }
  };

  const createSecretEnvelopes = async (target: Conversation, content: MessageContent, sentAt: string, editedAt?: string) => {
    if (!identity) throw new Error('Защищённое устройство не готово.');
    const recipient = await apiRequest<{ devices: PublicDevice[] }>(`/messages/users/${encodeURIComponent(target.otherUsername)}/devices`);
    if (!recipient.devices.length) throw new Error('Получатель ещё не открыл защищённый мессенджер на своём устройстве.');
    const payload: EncryptedMessagePayload = { ...content, version: 1, sentAt, ...(editedAt ? { editedAt } : {}) };
    const plaintext = JSON.stringify(payload);
    const targets = [...new Map([...recipient.devices, { deviceId: identity.deviceId, name: 'Это устройство', publicKey: identity.publicKey }]
      .map((device) => [device.deviceId, device])).values()];
    const baseId = crypto.randomUUID();
    return Promise.all(targets.map(async (device) => ({
      recipientDeviceId: device.deviceId,
      ciphertext: await encryptForDevice(plaintext, device.publicKey),
      clientMessageId: `${baseId}:${device.deviceId}`,
    })));
  };

  const sendContentToConversation = async (target: Conversation, content: MessageContent) => {
    if (!identity || sending) return false;
    setSending(true);
    setError(null);
    try {
      if (target.securityMode === 'cloud') {
        await apiRequest(`/messages/conversations/${target.id}/messages`, { method: 'POST', body: JSON.stringify({ content }) });
        if (target.id === activeId) await loadMessages();
        await loadConversations();
        return true;
      }
      const envelopes = await createSecretEnvelopes(target, content, new Date().toISOString());
      await apiRequest(`/messages/conversations/${target.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ senderDeviceId: identity.deviceId, envelopes }),
      });
      if (target.id === activeId) await loadMessages();
      await loadConversations();
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError || caught instanceof Error ? caught.message : 'Не удалось отправить сообщение.');
      return false;
    } finally {
      setSending(false);
    }
  };

  const sendContent = async (content: MessageContent) => {
    if (!active) return false;
    return sendContentToConversation(active, content);
  };

  const sendText = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (editingMessage) {
      await editTextMessage(editingMessage, text);
      return;
    }
    if (await sendContent({ type: 'text', text })) setDraft('');
  };

  const sendSticker = async (stickerId: StickerId) => {
    setShowStickers(false);
    await sendContent({ type: 'sticker', stickerId });
  };
  const openGiftPicker = async () => { if (!active || active.isSaved) return; setShowGifts(true); if (!giftTypes.length) { const result = await apiRequest<{ gifts: Array<{ id: string; title: string; basePrice: number; baseImage: string; remaining: number; canTransfer: boolean }> }>('/gifts'); setGiftTypes(result.gifts.filter((gift) => gift.canTransfer)); } };
  const sendGift = async (gift: { id: string; title: string; basePrice: number }) => { if (!active || active.isSaved || !window.confirm(`Отправить ${gift.title} пользователю @${active.otherUsername} за ${gift.basePrice} 💎?`)) return; const result = await apiRequest<{ gift: { id: string; title: string; image: string; inscription: string | null } }>(`/gifts/${gift.id}/send`, { method: 'POST', body: JSON.stringify({ recipientUsername: active.otherUsername, conversationId: active.id, inscription: giftInscription }) }); await sendContent({ type: 'gift', giftId: result.gift.id, title: result.gift.title, image: result.gift.image, inscription: result.gift.inscription }); setGiftInscription(''); setShowGifts(false); };

  const deleteMessage = async (message: PlainMessage) => {
    if (!active || message.senderUserId !== user?.id || deletingMessageId) return;
    setDeletingMessageId(message.id);
    setError(null);
    const attachmentId = attachmentIdFromMessage(message.content);
    try {
      await apiRequest(`/messages/conversations/${active.id}/messages/${message.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ ...(attachmentId ? { attachmentId } : {}) }),
      });
      setMessages((current) => current.filter((item) => item.id !== message.id));
      await loadConversations();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось удалить сообщение.');
    } finally {
      setDeletingMessageId(null);
    }
  };

  const editTextMessage = async (message: PlainMessage, text: string) => {
    if (!active || !identity || message.senderUserId !== user?.id || basicContent(message.content).type !== 'text') return;
    setSending(true);
    setError(null);
    try {
      if (active.securityMode === 'cloud') {
        await apiRequest(`/messages/conversations/${active.id}/messages/${message.id}`, {
          method: 'PUT',
          body: JSON.stringify({ content: { type: 'text', text } }),
        });
      } else {
        const editedAt = new Date().toISOString();
        const envelopes = await createSecretEnvelopes(active, { type: 'text', text }, message.sentAt, editedAt);
        await apiRequest(`/messages/conversations/${active.id}/messages/${message.id}`, {
          method: 'PUT',
          body: JSON.stringify({ senderDeviceId: identity.deviceId, envelopes }),
        });
      }
      setEditingMessage(null);
      setDraft('');
      await loadMessages();
    } catch (caught) {
      setError(caught instanceof ApiError || caught instanceof Error ? caught.message : 'Не удалось изменить сообщение.');
    } finally {
      setSending(false);
    }
  };

  const cancelEditing = () => {
    setEditingMessage(null);
    setDraft('');
  };

  const openMessageMenu = (message: PlainMessage, x: number, y: number) => {
    setMessageMenu({ message, x, y });
    if (navigator.vibrate) navigator.vibrate(25);
  };

  const clearLongPress = () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const handleMessagePointerDown = (event: ReactPointerEvent<HTMLElement>, message: PlainMessage) => {
    if (event.pointerType !== 'touch') return;
    clearLongPress();
    const { clientX, clientY } = event;
    longPressTimer.current = window.setTimeout(() => openMessageMenu(message, clientX, clientY), 480);
  };

  const handleMessageContextMenu = (event: ReactMouseEvent<HTMLElement>, message: PlainMessage) => {
    event.preventDefault();
    clearLongPress();
    openMessageMenu(message, event.clientX, event.clientY);
  };

  const beginEditing = (message: PlainMessage) => {
    const content = basicContent(message.content);
    if (content.type !== 'text' || message.content.type === 'forwarded') return;
    setMessageMenu(null);
    setEditingMessage(message);
    setDraft(content.text);
    window.setTimeout(() => draftInput.current?.focus(), 0);
  };

  const forwardMessage = async (target: Conversation) => {
    if (!forwardingMessage || !active) return;
    let content = basicContent(forwardingMessage.content);
    try {
      if (content.type === 'image' || content.type === 'audio') {
        const cloned = await apiRequest<{ attachmentId: string }>(`/messages/attachments/${content.attachmentId}/clone`, {
          method: 'POST',
          body: JSON.stringify({ targetConversationId: target.id }),
        });
        content = { ...content, attachmentId: cloned.attachmentId };
      }
      const fromDisplayName = forwardingMessage.content.type === 'forwarded'
        ? forwardingMessage.content.fromDisplayName
        : forwardingMessage.senderUserId === user?.id ? user?.displayName ?? 'Tyson' : active.otherDisplayName;
      const sent = await sendContentToConversation(target, { type: 'forwarded', fromDisplayName, content });
      if (sent) setForwardingMessage(null);
    } catch (caught) {
      setError(caught instanceof ApiError || caught instanceof Error ? caught.message : 'Не удалось переслать сообщение.');
    }
  };

  const uploadEncryptedAttachment = async (blob: Blob) => {
    if (!active) throw new Error('Сначала откройте диалог.');
    if (!blob.size || blob.size > maxUploadBytes) {
      throw new Error(`Файл должен быть не больше ${Math.round(maxUploadBytes / 1024 / 1024)} МБ.`);
    }
    const encrypted = await encryptAttachment(new Uint8Array(await blob.arrayBuffer()));
    const response = await apiRawRequest(`/messages/conversations/${active.id}/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: encrypted.ciphertext.slice().buffer,
    });
    const payload = await response.json() as { data: { attachmentId: string } };
    return {
      attachmentId: payload.data.attachmentId,
      key: encrypted.key,
      nonce: encrypted.nonce,
      digest: await attachmentDigest(encrypted.ciphertext),
    };
  };

  const sendImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !active) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > maxUploadBytes) {
      setError(`Можно отправить JPEG, PNG или WebP размером до ${Math.round(maxUploadBytes / 1024 / 1024)} МБ.`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const attachment = await uploadEncryptedAttachment(file);
      await sendContent({
        type: 'image',
        ...attachment,
        mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить изображение.');
    } finally {
      setUploading(false);
    }
  };

  const sendVoice = async (blob: Blob, durationMs: number) => {
    const mimeType = blob.type.split(';')[0];
    if (mimeType !== 'audio/webm' && mimeType !== 'audio/mp4' && mimeType !== 'audio/ogg') {
      setError('Этот формат голосовой записи не поддерживается браузером.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const attachment = await uploadEncryptedAttachment(blob);
      await sendContent({ type: 'audio', ...attachment, mimeType, durationMs: Math.max(1, Math.min(MAX_VOICE_DURATION_MS, Math.round(durationMs))) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить голосовое сообщение.');
    } finally {
      setUploading(false);
    }
  };

  const sendVideo = async (blob: Blob, durationMs: number) => {
    const mimeType = blob.type.split(';')[0];
    if (mimeType !== 'video/webm' && mimeType !== 'video/mp4') { setError('Этот формат видео не поддерживается браузером.'); return; }
    setUploading(true); setError(null);
    try { const attachment = await uploadEncryptedAttachment(blob); await sendContent({ type: 'video', ...attachment, mimeType, durationMs: Math.max(1, Math.min(MAX_VIDEO_DURATION_MS, Math.round(durationMs))) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось отправить видеосообщение.'); } finally { setUploading(false); }
  };

  const finishRecording = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  const startRecording = async (kind: 'audio' | 'video' = 'audio') => {
    if (recording || uploading || sending || !active) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Запись голосовых не поддерживается этим браузером.');
      return;
    }
    setError(null);
    setShowStickers(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { audio: true, video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } } } : { audio: { echoCancellation: true, noiseSuppression: true } });
      const supportedMimeType = kind === 'video' ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm') : AUDIO_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const nextRecorder = new MediaRecorder(stream, supportedMimeType ? { mimeType: supportedMimeType, ...(kind === 'video' ? { videoBitsPerSecond: 500_000 } : { audioBitsPerSecond: 64_000 }) } : {});
      microphoneStream.current = stream;
      recorder.current = nextRecorder;
      voiceChunks.current = [];
      voiceBytes.current = 0;
      recordingStartedAt.current = Date.now();
      setRecordingSeconds(0);
      setRecordingKind(kind);

      nextRecorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        voiceChunks.current.push(event.data);
        voiceBytes.current += event.data.size;
        if (voiceBytes.current > maxUploadBytes && nextRecorder.state === 'recording') nextRecorder.stop();
      };
      nextRecorder.onerror = () => setError('Не удалось записать голосовое сообщение.');
      nextRecorder.onstop = () => {
        const durationMs = Date.now() - recordingStartedAt.current;
        if (recordingTimer.current !== null) window.clearInterval(recordingTimer.current);
        recordingTimer.current = null;
        stream.getTracks().forEach((track) => track.stop());
        microphoneStream.current = null;
        recorder.current = null;
        setRecording(false);
        const voice = new Blob(voiceChunks.current, { type: nextRecorder.mimeType || supportedMimeType || 'audio/webm' });
        voiceChunks.current = [];
        if (voice.size > maxUploadBytes) {
          setError(`Голосовое превысило лимит ${Math.round(maxUploadBytes / 1024 / 1024)} МБ и не было отправлено.`);
          return;
        }
        if (durationMs < 400 || !voice.size) {
          setError('Голосовое сообщение получилось слишком коротким.');
          return;
        }
        void (kind === 'video' ? sendVideo(voice, durationMs) : sendVoice(voice, durationMs));
      };
      nextRecorder.start(1000);
      setRecording(true);
      recordingTimer.current = window.setInterval(() => {
        const elapsedMs = Date.now() - recordingStartedAt.current;
        setRecordingSeconds(Math.floor(elapsedMs / 1000));
        if (elapsedMs >= (kind === 'video' ? MAX_VIDEO_DURATION_MS : MAX_VOICE_DURATION_MS) && nextRecorder.state === 'recording') nextRecorder.stop();
      }, 500);
    } catch {
      microphoneStream.current?.getTracks().forEach((track) => track.stop());
      microphoneStream.current = null;
      setError(kind === 'video' ? 'Разрешите Tyson доступ к камере и микрофону.' : 'Разрешите Tyson доступ к микрофону, чтобы записывать голосовые.');
    }
  };

  const sendSharedPost = async () => {
    if (!sharedPostId || !/^[0-9a-f-]{36}$/iu.test(sharedPostId)) return;
    await sendContent({ type: 'post', postId: sharedPostId });
    if (active) setSearchParams({ conversation: active.id });
  };
  const sendSharedComment = async () => { if (!sharedCommentId || !sharedCommentPostId || !/^[0-9a-f-]{36}$/iu.test(sharedCommentId) || !/^[0-9a-f-]{36}$/iu.test(sharedCommentPostId)) return; await sendContent({ type: 'comment', commentId: sharedCommentId, postId: sharedCommentPostId }); setSearchParams({ conversation: active?.id ?? '' }); };

  const closeMobileChat = () => {
    setActiveId(null);
    setSearchParams(sharedPostId ? { sharePost: sharedPostId } : {});
    setShowStickers(false);
  };

  return <section className={`messages-page${activeId ? ' mobile-chat-open' : ''}`}>
    <aside className="conversation-list">
      <div className="messages-title"><div><p className="eyebrow">Синхронизация между устройствами</p><h1>Messenger</h1></div><LockKeyhole size={21} /></div>
      <div className="messenger-unified-search"><div className="new-conversation"><Search size={17} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Поиск людей и сообщений" />{secretChatsEnabled && <label className="secret-chat-option"><input type="checkbox" checked={startSecretChat} onChange={(event) => setStartSecretChat(event.target.checked)} />Секретный</label>}</div>{(followedPeople.length > 0 || messageResults.length > 0) && <div className="unified-search-results">{followedPeople.length > 0 && <><p>Написать</p>{followedPeople.map((person) => <button key={person.id} type="button" onClick={() => void openConversation(person.username)}><span className="avatar avatar-small">{person.avatarKey ? <img className="avatar-image" src={mediaUrl(person.avatarKey) ?? ''} alt="" /> : person.displayName.slice(0, 1).toUpperCase()}</span><span><strong>{person.displayName}</strong><small>Открыть диалог</small></span></button>)}</>}{messageResults.length > 0 && <><p>Сообщения</p>{messageResults.map((result) => <button className="message-result" key={result.id} type="button" onClick={() => { setActiveId(result.conversationId); setSearchParams({ conversation: result.conversationId }); setSearchQuery(''); }}><strong>{result.excerpt}</strong><small>{new Date(result.sentAt).toLocaleDateString('ru-RU')}</small></button>)}</>}</div>}</div>
      <button className="create-group-trigger" type="button" onClick={() => setShowGroupCreator((value) => !value)}><UsersRound size={17} />Создать группу</button>{showGroupCreator && <form className="group-creator" onSubmit={(event) => void startGroup(event)}><input required maxLength={80} value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} placeholder="Название группы" /><input required minLength={3} maxLength={30} pattern="[A-Za-z](?:[A-Za-z0-9]|_[A-Za-z0-9])*" title="Начните с буквы. Нельзя использовать несколько подчёркиваний подряд или подчёркивание в конце." value={groupUsername} onChange={(event) => setGroupUsername(event.target.value)} placeholder="username группы" /><small>Username начинается с буквы. Участников можно добавить после создания.</small><button type="submit">Создать группу</button></form>}
      <button className={activeId === TYSON_AI_CHAT_ID ? 'conversation ai-conversation active' : 'conversation ai-conversation'} onClick={() => { setActiveId(TYSON_AI_CHAT_ID); setSearchParams({ conversation: TYSON_AI_CHAT_ID }); }}><span className="avatar avatar-small ai-conversation-avatar"><Sparkles size={20} /></span><span><strong>Tyson AI</strong><small>На основе Gemini</small></span></button>
      {conversations.map((conversation) => <button key={conversation.id} className={conversation.id === activeId ? 'conversation active' : 'conversation'} onClick={() => { setActiveId(conversation.id); setSearchParams(sharedPostId ? { conversation: conversation.id, sharePost: sharedPostId } : { conversation: conversation.id }); }}><span className={`avatar avatar-small${conversation.isSaved ? ' saved-avatar' : ''}`}>{conversation.isSaved ? <Bookmark size={20} /> : conversation.kind === 'group' ? <UsersRound size={18} /> : conversation.otherAvatarKey ? <img className="avatar-image" src={mediaUrl(conversation.otherAvatarKey) ?? ''} alt="" /> : conversation.otherDisplayName.slice(0, 1).toUpperCase()}</span><span><strong>{conversation.otherDisplayName}</strong><small>{conversation.isSaved ? 'Личный защищённый архив' : conversation.kind === 'group' ? `${conversation.memberCount} участника` : `@${conversation.otherUsername}`}</small></span></button>)}
    </aside>
    <div className="chat-panel">{activeId === TYSON_AI_CHAT_ID ? <MessengerAiChat onBack={closeMobileChat} /> : active ? <>
      <header><button className="mobile-chat-back" type="button" aria-label="Вернуться к диалогам" onClick={closeMobileChat}><ChevronLeft /></button>{active.isSaved || active.kind === 'group' ? <div className="chat-profile-link"><span className="avatar avatar-small saved-avatar">{active.isSaved ? <Bookmark size={19} /> : <UsersRound size={18} />}</span><span className="chat-profile-copy"><strong>{active.otherDisplayName}</strong><small>{active.isSaved ? 'Ваш личный архив' : `${active.memberCount} участника · @${active.otherUsername}`}</small></span></div> : <Link className="chat-profile-link" to={`/profile/${encodeURIComponent(active.otherUsername)}`} aria-label={`Открыть профиль ${active.otherDisplayName}`}><span className="avatar avatar-small">{active.otherAvatarKey ? <img className="avatar-image" src={mediaUrl(active.otherAvatarKey) ?? ''} alt="" /> : active.otherDisplayName.slice(0, 1).toUpperCase()}</span><span className="chat-profile-copy"><strong>{active.otherDisplayName}</strong><small className={remoteActivity ? 'messenger-activity' : ''}>{remoteActivity === 'typing' ? 'печатает…' : remoteActivity === 'recording_audio' ? 'записывает голосовое…' : remoteActivity === 'recording_video' ? 'записывает видеосообщение…' : `@${active.otherUsername}`}</small></span></Link>}<span className="chat-security"><LockKeyhole size={14} />{active.securityMode === 'secret' ? 'E2EE' : 'Защищено'}</span></header>
      <div className="message-stream">{messages.map((message, index) => {
        const displayedContent = basicContent(message.content);
        const sticker = displayedContent.type === 'sticker' ? getSticker(displayedContent.stickerId) : null;
        const startsDay = index === 0 || messageDayKey(messages[index - 1].sentAt) !== messageDayKey(message.sentAt);
        return <Fragment key={message.id}>
          {startsDay && <div className="message-day-separator"><span>{formatMessageDay(message.sentAt)}</span></div>}
          <article className={`${message.senderUserId === user?.id ? 'message mine' : 'message'}${sticker ? ' sticker-message' : ''}`}
            onPointerDown={(event) => handleMessagePointerDown(event, message)} onPointerUp={clearLongPress}
            onPointerCancel={clearLongPress} onPointerMove={clearLongPress}
            onContextMenu={(event) => handleMessageContextMenu(event, message)}>
            <MessageBody content={message.content} />
            <small>{message.editedAt && <span>изменено</span>}{new Date(message.sentAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>
          </article>
        </Fragment>;
      })}{!messages.length && <div className="chat-empty"><LockKeyhole /><p>{active.securityMode === 'secret' ? 'Секретные сообщения шифруются только на устройствах участников.' : 'Сообщения синхронизируются со всеми вашими устройствами и шифруются при хранении.'}</p></div>}<div ref={messageEnd} aria-hidden="true" /></div>
      <div className="composer-area">
        {active.kind === 'group' && <form className="group-creator group-member-adder" onSubmit={(event) => void addGroupMember(event)}><strong>Управление группой</strong><input required minLength={3} maxLength={30} value={groupMemberUsername} onChange={(event) => setGroupMemberUsername(event.target.value)} placeholder="username участника" /><label><input type="checkbox" checked={groupMemberAdmin} onChange={(event) => setGroupMemberAdmin(event.target.checked)} /> Сделать администратором</label><button type="submit">Добавить</button></form>}
        {editingMessage && <div className="message-edit-bar"><Pencil size={16} /><div><strong>Изменение сообщения</strong><small>Время отправки останется прежним</small></div><button type="button" aria-label="Отменить изменение" onClick={cancelEditing}><X /></button></div>}
        {(sharedPostId || sharedCommentId) && <div className="share-post-bar"><div><strong>{sharedCommentId ? 'Отправить комментарий' : 'Отправить публикацию'}</strong><small>{active.isSaved ? 'Сохранить в Избранное' : `Поделиться с @${active.otherUsername}`}</small></div><button type="button" disabled={sending} onClick={() => void (sharedCommentId ? sendSharedComment() : sendSharedPost())}><Send size={16} />Отправить</button></div>}
        {showStickers && <div className="sticker-picker" aria-label="Стикеры">{STICKERS.map((sticker) => <button key={sticker.id} type="button" disabled={sending} aria-label={sticker.accessibleLabel} onClick={() => void sendSticker(sticker.id)}><img src={sticker.src} alt="" /></button>)}</div>}
        {showGifts && <div className="sticker-picker gift-picker" aria-label="Подарки"><input maxLength={140} value={giftInscription} onChange={(event) => setGiftInscription(event.target.value)} placeholder="Подпись к подарку (необязательно)" />{giftTypes.map((gift) => <button key={gift.id} type="button" disabled={sending || !gift.remaining} onClick={() => void sendGift(gift)}><img src={gift.baseImage} alt="" /><small>{gift.title} · {gift.basePrice} 💎</small></button>)}</div>}
        <form className="message-composer" onSubmit={(event) => void sendText(event)}>
          <button className="image-message-trigger" type="button" disabled={uploading || sending || recording} aria-label="Прикрепить изображение" onClick={() => imageInput.current?.click()}><Paperclip /></button><input ref={imageInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void sendImage(event)} />
          <button className="sticker-trigger" type="button" disabled={sending || active.isSaved} aria-label="Отправить подарок" onClick={() => void openGiftPicker()}><Gift /></button>
          <div className="message-input-glass">
            {recording ? <div className="voice-recording-status" role="status"><span aria-hidden="true" />{recordingKind === 'video' ? 'Видеосообщение' : 'Запись'} {formatDuration(recordingSeconds)}</div> : <textarea ref={draftInput} rows={1} required maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Сообщение" />}
            <button className="sticker-trigger" type="button" disabled={recording} aria-label="Открыть стикеры" aria-expanded={showStickers} onClick={() => setShowStickers((shown) => !shown)}><Smile /></button>
          </div>
          {recording ? <button className="voice-message-trigger recording" type="button" disabled={uploading || sending} aria-label="Остановить и отправить голосовое" onClick={finishRecording}><Square size={17} fill="currentColor" /></button>
            : draft.trim() ? <button className="composer-primary-action" type="submit" disabled={sending || uploading} aria-label="Отправить"><Send /></button>
              : <><button className="video-message-trigger" type="button" disabled={uploading || sending} aria-label="Записать видеосообщение" onClick={() => void startRecording('video')}><Camera /></button><button className="voice-message-trigger" type="button" disabled={uploading || sending} aria-label="Записать голосовое" onClick={() => void startRecording()}><Mic /></button></>}
        </form>
      </div>
      {messageMenu && <div className="message-menu-layer" role="presentation" onPointerDown={() => setMessageMenu(null)}>
        <div className="message-context-menu" role="menu" style={{ '--menu-x': `${messageMenu.x}px`, '--menu-y': `${messageMenu.y}px` } as CSSProperties} onPointerDown={(event) => event.stopPropagation()}>
          {messageMenu.message.senderUserId === user?.id && messageMenu.message.content.type === 'text' && <button type="button" role="menuitem" onClick={() => beginEditing(messageMenu.message)}><Pencil />Изменить</button>}
          <button type="button" role="menuitem" onClick={() => { setForwardingMessage(messageMenu.message); setMessageMenu(null); }}><ForwardIcon />Переслать</button>
          {messageMenu.message.senderUserId === user?.id && <button className="danger" type="button" role="menuitem" disabled={deletingMessageId === messageMenu.message.id} onClick={() => { const selected = messageMenu.message; setMessageMenu(null); void deleteMessage(selected); }}><Trash2 />Удалить</button>}
        </div>
      </div>}
      {forwardingMessage && <div className="forward-dialog-layer" role="presentation" onPointerDown={() => setForwardingMessage(null)}>
        <section className="forward-dialog" role="dialog" aria-modal="true" aria-labelledby="forward-dialog-title" onPointerDown={(event) => event.stopPropagation()}>
          <header><div><p className="eyebrow">Пересылка</p><h2 id="forward-dialog-title">Выберите чат</h2></div><button type="button" aria-label="Закрыть" onClick={() => setForwardingMessage(null)}><X /></button></header>
          <div className="forward-conversation-list">{conversations.map((conversation) => <button key={conversation.id} type="button" disabled={sending} onClick={() => void forwardMessage(conversation)}>
            <span className={`avatar avatar-small${conversation.isSaved ? ' saved-avatar' : ''}`}>{conversation.isSaved ? <Bookmark size={18} /> : conversation.otherAvatarKey ? <img className="avatar-image" src={mediaUrl(conversation.otherAvatarKey) ?? ''} alt="" /> : conversation.otherDisplayName.slice(0, 1).toUpperCase()}</span>
            <span><strong>{conversation.otherDisplayName}</strong><small>{conversation.isSaved ? 'Личный архив' : `@${conversation.otherUsername}`}</small></span><ForwardIcon />
          </button>)}</div>
        </section>
      </div>}
    </> : <div className="chat-empty"><LockKeyhole /><h2>Защищённый разговор</h2><p>Введите username слева, чтобы начать переписку.</p></div>}{error && <p className="messages-error" role="alert">{error}</p>}</div>
  </section>;
}
