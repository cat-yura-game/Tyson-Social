import { Bookmark, ChevronLeft, LockKeyhole, Mic, Paperclip, Plus, Send, Smile, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, apiRawRequest, apiRequest, mediaUrl } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { attachmentDigest, decryptForDevice, encryptAttachment, encryptForDevice, getOrCreateIdentity, type DeviceIdentity } from '../messaging/crypto';
import { parseMessageContent, type EncryptedMessagePayload, type MessageContent } from '../messaging/message-content';
import { getSticker, STICKERS, type StickerId } from '../messaging/stickers';
import { EncryptedMessageImage } from '../components/EncryptedMessageImage';
import { EncryptedMessageAudio } from '../components/EncryptedMessageAudio';

const STANDARD_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_VOICE_DURATION_MS = 10 * 60 * 1000;
const AUDIO_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'] as const;

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
}

interface PublicDevice { deviceId: string; name: string; publicKey: string }
interface EncryptedMessage { id: string; senderUserId: string; senderDeviceId: string; ciphertext: string; sentAt: string }
interface PlainMessage extends EncryptedMessage { content: MessageContent }
interface CloudMessage { id: string; senderUserId: string; sentAt: string; content: unknown }

export function MessagesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PlainMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [secretChatsEnabled, setSecretChatsEnabled] = useState(false);
  const [startSecretChat, setStartSecretChat] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [maxUploadBytes, setMaxUploadBytes] = useState(STANDARD_UPLOAD_BYTES);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const messageEnd = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);
  const voiceChunks = useRef<Blob[]>([]);
  const voiceBytes = useRef(0);
  const recordingStartedAt = useRef(0);
  const recordingTimer = useRef<number | null>(null);
  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const sharedPostId = searchParams.get('sharePost');

  const loadConversations = useCallback(async () => {
    const result = await apiRequest<{ conversations: Conversation[] }>('/messages/conversations');
    setConversations(result.conversations);
    const requested = searchParams.get('conversation');
    setActiveId((current) => requested && result.conversations.some((item) => item.id === requested)
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

  useEffect(() => {
    if (!user) return;
    void apiRequest<{ maxBytes: number }>('/messages/upload-limit')
      .then(({ maxBytes }) => setMaxUploadBytes(maxBytes))
      .catch(() => setMaxUploadBytes(STANDARD_UPLOAD_BYTES));
  }, [user]);

  useEffect(() => () => {
    if (recordingTimer.current !== null) window.clearInterval(recordingTimer.current);
    if (recorder.current && recorder.current.state !== 'inactive') {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    microphoneStream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const loadMessages = useCallback(async () => {
    if (!activeId || !identity || busy.current) return;
    busy.current = true;
    try {
      const path = active?.securityMode === 'secret'
        ? `/messages/conversations/${activeId}/messages?deviceId=${identity.deviceId}`
        : `/messages/conversations/${activeId}/messages`;
      const result = await apiRequest<{ securityMode: 'cloud' | 'secret'; messages: EncryptedMessage[] | CloudMessage[] }>(path);
      if (result.securityMode === 'cloud') {
        setMessages((result.messages as CloudMessage[]).map((message) => {
          try { return { ...message, senderDeviceId: '', ciphertext: '', content: parseMessageContent(message.content) }; }
          catch { return { ...message, senderDeviceId: '', ciphertext: '', content: { type: 'text', text: 'Не удалось прочитать сообщение.' } }; }
        }));
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
      setMessages(decrypted);
    } finally {
      busy.current = false;
    }
  }, [active?.securityMode, activeId, identity]);

  useEffect(() => {
    setShowStickers(false);
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(), 4000);
    return () => window.clearInterval(timer);
  }, [loadMessages]);

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ block: 'end' });
  }, [activeId, messages.length]);

  const startConversation = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await apiRequest<{ conversation: { id: string } }>('/messages/conversations', {
        method: 'POST',
        body: JSON.stringify({ recipientUsername: newUsername, securityMode: startSecretChat ? 'secret' : 'cloud' }),
      });
      setNewUsername('');
      await loadConversations();
      setActiveId(result.conversation.id);
      setSearchParams(sharedPostId ? { conversation: result.conversation.id, sharePost: sharedPostId } : { conversation: result.conversation.id });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось начать разговор.');
    }
  };

  const sendContent = async (content: MessageContent) => {
    if (!active || !identity || sending) return;
    setSending(true);
    setError(null);
    try {
      if (active.securityMode === 'cloud') {
        await apiRequest(`/messages/conversations/${active.id}/messages`, { method: 'POST', body: JSON.stringify({ content }) });
        await loadMessages();
        await loadConversations();
        return;
      }
      const recipient = await apiRequest<{ devices: PublicDevice[] }>(`/messages/users/${encodeURIComponent(active.otherUsername)}/devices`);
      if (!recipient.devices.length) throw new Error('Получатель ещё не открыл защищённый мессенджер на своём устройстве.');
      const payload: EncryptedMessagePayload = { ...content, version: 1, sentAt: new Date().toISOString() };
      const plaintext = JSON.stringify(payload);
      const targets = [...new Map([...recipient.devices, { deviceId: identity.deviceId, name: 'Это устройство', publicKey: identity.publicKey }]
        .map((device) => [device.deviceId, device])).values()];
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

  const finishRecording = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  const startRecording = async () => {
    if (recording || uploading || sending || !active) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Запись голосовых не поддерживается этим браузером.');
      return;
    }
    setError(null);
    setShowStickers(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const supportedMimeType = AUDIO_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const nextRecorder = new MediaRecorder(stream, supportedMimeType ? { mimeType: supportedMimeType, audioBitsPerSecond: 64_000 } : { audioBitsPerSecond: 64_000 });
      microphoneStream.current = stream;
      recorder.current = nextRecorder;
      voiceChunks.current = [];
      voiceBytes.current = 0;
      recordingStartedAt.current = Date.now();
      setRecordingSeconds(0);

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
        void sendVoice(voice, durationMs);
      };
      nextRecorder.start(1000);
      setRecording(true);
      recordingTimer.current = window.setInterval(() => {
        const elapsedMs = Date.now() - recordingStartedAt.current;
        setRecordingSeconds(Math.floor(elapsedMs / 1000));
        if (elapsedMs >= MAX_VOICE_DURATION_MS && nextRecorder.state === 'recording') nextRecorder.stop();
      }, 500);
    } catch {
      microphoneStream.current?.getTracks().forEach((track) => track.stop());
      microphoneStream.current = null;
      setError('Разрешите Tyson доступ к микрофону, чтобы записывать голосовые.');
    }
  };

  const sendSharedPost = async () => {
    if (!sharedPostId || !/^[0-9a-f-]{36}$/iu.test(sharedPostId)) return;
    await sendContent({ type: 'post', postId: sharedPostId });
    if (active) setSearchParams({ conversation: active.id });
  };

  const closeMobileChat = () => {
    setActiveId(null);
    setSearchParams(sharedPostId ? { sharePost: sharedPostId } : {});
    setShowStickers(false);
  };

  return <section className={`messages-page${active ? ' mobile-chat-open' : ''}`}>
    <aside className="conversation-list">
      <div className="messages-title"><div><p className="eyebrow">Синхронизация между устройствами</p><h1>Сообщения</h1></div><LockKeyhole size={21} /></div>
      <form className="new-conversation" onSubmit={(event) => void startConversation(event)}><input required value={newUsername} onChange={(event) => setNewUsername(event.target.value)} placeholder="username получателя" /><button type="submit" aria-label="Начать разговор"><Plus /></button>{secretChatsEnabled && <label className="secret-chat-option"><input type="checkbox" checked={startSecretChat} onChange={(event) => setStartSecretChat(event.target.checked)} />Секретный чат</label>}</form>
      {conversations.map((conversation) => <button key={conversation.id} className={conversation.id === activeId ? 'conversation active' : 'conversation'} onClick={() => { setActiveId(conversation.id); setSearchParams(sharedPostId ? { conversation: conversation.id, sharePost: sharedPostId } : { conversation: conversation.id }); }}><span className={`avatar avatar-small${conversation.isSaved ? ' saved-avatar' : ''}`}>{conversation.isSaved ? <Bookmark size={20} /> : conversation.otherAvatarKey ? <img className="avatar-image" src={mediaUrl(conversation.otherAvatarKey) ?? ''} alt="" /> : conversation.otherDisplayName.slice(0, 1).toUpperCase()}</span><span><strong>{conversation.otherDisplayName}</strong><small>{conversation.isSaved ? 'Личный защищённый архив' : `@${conversation.otherUsername}`}</small></span></button>)}
    </aside>
    <div className="chat-panel">{active ? <>
      <header><button className="mobile-chat-back" type="button" aria-label="Вернуться к диалогам" onClick={closeMobileChat}><ChevronLeft /></button>{active.isSaved ? <div className="chat-profile-link"><span className="avatar avatar-small saved-avatar"><Bookmark size={19} /></span><span className="chat-profile-copy"><strong>{active.otherDisplayName}</strong><small>Ваш личный архив</small></span></div> : <Link className="chat-profile-link" to={`/profile/${encodeURIComponent(active.otherUsername)}`} aria-label={`Открыть профиль ${active.otherDisplayName}`}><span className="avatar avatar-small">{active.otherAvatarKey ? <img className="avatar-image" src={mediaUrl(active.otherAvatarKey) ?? ''} alt="" /> : active.otherDisplayName.slice(0, 1).toUpperCase()}</span><span className="chat-profile-copy"><strong>{active.otherDisplayName}</strong><small>@{active.otherUsername}</small></span></Link>}<span className="chat-security"><LockKeyhole size={14} />{active.securityMode === 'secret' ? 'E2EE' : 'Защищено'}</span></header>
      <div className="message-stream">{messages.map((message) => {
        const sticker = message.content.type === 'sticker' ? getSticker(message.content.stickerId) : null;
        return <article key={message.id} className={`${message.senderUserId === user?.id ? 'message mine' : 'message'}${sticker ? ' sticker-message' : ''}`}>
          {message.content.type === 'text' ? <p>{message.content.text}</p>
            : sticker ? <img className="message-sticker" src={sticker.src} alt={sticker.accessibleLabel} />
              : message.content.type === 'post' ? <Link className="shared-post-message" to={`/post/${message.content.postId}`}><strong>Публикация Tyson</strong><span>Открыть публикацию</span></Link>
                : message.content.type === 'image' ? <EncryptedMessageImage attachmentId={message.content.attachmentId} encryptionKey={message.content.key} nonce={message.content.nonce} digest={message.content.digest} mimeType={message.content.mimeType} />
                  : message.content.type === 'audio' ? <EncryptedMessageAudio attachmentId={message.content.attachmentId} encryptionKey={message.content.key} nonce={message.content.nonce} digest={message.content.digest} mimeType={message.content.mimeType} /> : null}
          <small>{new Date(message.sentAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>
        </article>;
      })}{!messages.length && <div className="chat-empty"><LockKeyhole /><p>{active.securityMode === 'secret' ? 'Секретные сообщения шифруются только на устройствах участников.' : 'Сообщения синхронизируются со всеми вашими устройствами и шифруются при хранении.'}</p></div>}<div ref={messageEnd} aria-hidden="true" /></div>
      <div className="composer-area">
        {sharedPostId && <div className="share-post-bar"><div><strong>Отправить публикацию</strong><small>{active.isSaved ? 'Сохранить в Избранное' : `Поделиться с @${active.otherUsername}`}</small></div><button type="button" disabled={sending} onClick={() => void sendSharedPost()}><Send size={16} />Отправить</button></div>}
        {showStickers && <div className="sticker-picker" aria-label="Стикеры">{STICKERS.map((sticker) => <button key={sticker.id} type="button" disabled={sending} aria-label={sticker.accessibleLabel} onClick={() => void sendSticker(sticker.id)}><img src={sticker.src} alt="" /></button>)}</div>}
        <form className="message-composer" onSubmit={(event) => void sendText(event)}>
          <button className="image-message-trigger" type="button" disabled={uploading || sending || recording} aria-label="Прикрепить изображение" onClick={() => imageInput.current?.click()}><Paperclip /></button><input ref={imageInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void sendImage(event)} />
          <div className="message-input-glass">
            {recording ? <div className="voice-recording-status" role="status"><span aria-hidden="true" />Запись {formatDuration(recordingSeconds)}</div> : <textarea required maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Сообщение" />}
            <button className="sticker-trigger" type="button" disabled={recording} aria-label="Открыть стикеры" aria-expanded={showStickers} onClick={() => setShowStickers((shown) => !shown)}><Smile /></button>
          </div>
          {recording ? <button className="voice-message-trigger recording" type="button" disabled={uploading || sending} aria-label="Остановить и отправить голосовое" onClick={finishRecording}><Square size={17} fill="currentColor" /></button>
            : draft.trim() ? <button className="composer-primary-action" type="submit" disabled={sending || uploading} aria-label="Отправить"><Send /></button>
              : <button className="voice-message-trigger" type="button" disabled={uploading || sending} aria-label="Записать голосовое" onClick={() => void startRecording()}><Mic /></button>}
        </form>
      </div>
    </> : <div className="chat-empty"><LockKeyhole /><h2>Защищённый разговор</h2><p>Введите username слева, чтобы начать переписку.</p></div>}{error && <p className="messages-error" role="alert">{error}</p>}</div>
  </section>;
}
