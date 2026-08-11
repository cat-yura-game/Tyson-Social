import { LockKeyhole, Plus, Send, Smile } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { decryptForDevice, encryptForDevice, getOrCreateIdentity, type DeviceIdentity } from '../messaging/crypto';
import { parseMessageContent, type EncryptedMessagePayload, type MessageContent } from '../messaging/message-content';
import { getSticker, STICKERS, type StickerId } from '../messaging/stickers';

interface Conversation {
  id: string;
  updatedAt: string;
  otherUserId: string;
  otherUsername: string;
  otherDisplayName: string;
  otherAvatarKey: string | null;
  otherVerified: number | boolean;
}

interface PublicDevice { deviceId: string; name: string; publicKey: string }
interface EncryptedMessage { id: string; senderUserId: string; senderDeviceId: string; ciphertext: string; sentAt: string }
interface PlainMessage extends EncryptedMessage { content: MessageContent }

export function MessagesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PlainMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;

  const loadConversations = useCallback(async () => {
    const result = await apiRequest<{ conversations: Conversation[] }>('/messages/conversations');
    setConversations(result.conversations);
    const requested = searchParams.get('conversation');
    setActiveId((current) => requested && result.conversations.some((item) => item.id === requested)
      ? requested
      : current ?? result.conversations[0]?.id ?? null);
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

  const loadMessages = useCallback(async () => {
    if (!activeId || !identity || busy.current) return;
    busy.current = true;
    try {
      const result = await apiRequest<{ messages: EncryptedMessage[] }>(`/messages/conversations/${activeId}/messages?deviceId=${identity.deviceId}`);
      const decrypted = await Promise.all(result.messages.map(async (message): Promise<PlainMessage> => {
        try {
          const payload = JSON.parse(await decryptForDevice(message.ciphertext, identity)) as unknown;
          return { ...message, content: parseMessageContent(payload) };
        } catch {
          return { ...message, content: { type: 'text', text: 'Не удалось расшифровать сообщение на этом устройстве.' } };
        }
      }));
      setMessages(decrypted);
    } finally {
      busy.current = false;
    }
  }, [activeId, identity]);

  useEffect(() => {
    setShowStickers(false);
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(), 4000);
    return () => window.clearInterval(timer);
  }, [loadMessages]);

  const startConversation = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await apiRequest<{ conversation: { id: string } }>('/messages/conversations', {
        method: 'POST',
        body: JSON.stringify({ recipientUsername: newUsername }),
      });
      setNewUsername('');
      await loadConversations();
      setActiveId(result.conversation.id);
      setSearchParams({ conversation: result.conversation.id });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось начать разговор.');
    }
  };

  const sendContent = async (content: MessageContent) => {
    if (!active || !identity || sending) return;
    setSending(true);
    setError(null);
    try {
      const recipient = await apiRequest<{ devices: PublicDevice[] }>(`/messages/users/${encodeURIComponent(active.otherUsername)}/devices`);
      if (!recipient.devices.length) throw new Error('Получатель ещё не открыл защищённый мессенджер на своём устройстве.');
      const payload: EncryptedMessagePayload = { ...content, version: 1, sentAt: new Date().toISOString() };
      const plaintext = JSON.stringify(payload);
      const targets = [...recipient.devices, { deviceId: identity.deviceId, name: 'Это устройство', publicKey: identity.publicKey }];
      const baseId = crypto.randomUUID();
      const envelopes = await Promise.all(targets.map(async (device) => ({
        recipientDeviceId: device.deviceId,
        ciphertext: await encryptForDevice(plaintext, device.publicKey),
        clientMessageId: `${baseId}:${device.deviceId}`,
      })));
      await apiRequest(`/messages/conversations/${active.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ senderDeviceId: identity.deviceId, envelopes }),
      });
      await loadMessages();
      await loadConversations();
    } catch (caught) {
      setError(caught instanceof ApiError || caught instanceof Error ? caught.message : 'Не удалось отправить сообщение.');
    } finally {
      setSending(false);
    }
  };

  const sendText = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    await sendContent({ type: 'text', text });
    setDraft('');
  };

  const sendSticker = async (stickerId: StickerId) => {
    setShowStickers(false);
    await sendContent({ type: 'sticker', stickerId });
  };

  return <section className="messages-page">
    <aside className="conversation-list">
      <div className="messages-title"><div><p className="eyebrow">End-to-end encryption</p><h1>Сообщения</h1></div><LockKeyhole size={21} /></div>
      <form className="new-conversation" onSubmit={(event) => void startConversation(event)}><input required value={newUsername} onChange={(event) => setNewUsername(event.target.value)} placeholder="username получателя" /><button type="submit" aria-label="Начать разговор"><Plus /></button></form>
      {conversations.map((conversation) => <button key={conversation.id} className={conversation.id === activeId ? 'conversation active' : 'conversation'} onClick={() => { setActiveId(conversation.id); setSearchParams({ conversation: conversation.id }); }}><span className="avatar avatar-small">{conversation.otherDisplayName.slice(0, 1).toUpperCase()}</span><span><strong>{conversation.otherDisplayName}</strong><small>@{conversation.otherUsername}</small></span></button>)}
    </aside>
    <div className="chat-panel">{active ? <>
      <header><div><strong>{active.otherDisplayName}</strong><small>@{active.otherUsername}</small></div><span><LockKeyhole size={14} />E2EE</span></header>
      <div className="message-stream">{messages.map((message) => {
        const sticker = message.content.type === 'sticker' ? getSticker(message.content.stickerId) : null;
        return <article key={message.id} className={`${message.senderUserId === user?.id ? 'message mine' : 'message'}${sticker ? ' sticker-message' : ''}`}>
          {message.content.type === 'text' ? <p>{message.content.text}</p> : sticker ? <img className="message-sticker" src={sticker.src} alt={sticker.accessibleLabel} /> : null}
          <small>{new Date(message.sentAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>
        </article>;
      })}{!messages.length && <div className="chat-empty"><LockKeyhole /><p>Сообщения и выбранные стикеры шифруются на вашем устройстве.</p></div>}</div>
      <div className="composer-area">
        {showStickers && <div className="sticker-picker" aria-label="Стикеры">{STICKERS.map((sticker) => <button key={sticker.id} type="button" disabled={sending} aria-label={sticker.accessibleLabel} onClick={() => void sendSticker(sticker.id)}><img src={sticker.src} alt="" /></button>)}</div>}
        <form className="message-composer" onSubmit={(event) => void sendText(event)}>
          <button className="sticker-trigger" type="button" aria-label="Открыть стикеры" aria-expanded={showStickers} onClick={() => setShowStickers((shown) => !shown)}><Smile /></button>
          <textarea required maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Сообщение" />
          <button type="submit" disabled={sending || !draft.trim()} aria-label="Отправить"><Send /></button>
        </form>
      </div>
    </> : <div className="chat-empty"><LockKeyhole /><h2>Защищённый разговор</h2><p>Введите username слева, чтобы начать переписку.</p></div>}{error && <p className="messages-error" role="alert">{error}</p>}</div>
  </section>;
}
