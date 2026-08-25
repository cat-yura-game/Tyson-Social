import { Archive, ArchiveRestore, FileText, Gauge, Menu, Mic, MoreHorizontal, Paperclip, Plus, Send, Sparkles, SquarePen, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ThinkingState } from '@aicss/react/thinking-state';
import { TextResponse } from '@aicss/react/text-response';
import { API_URL, apiRequest, mediaUrl } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { RichAiText } from '../components/RichAiText';

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageStorageKey: string | null;
  attachmentName?: string | null;
  attachmentContentType?: string | null;
  imageExpired: boolean | number;
  modelVersion?: string | null;
  createdAt: string;
}

type SpeechRecognitionResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type BrowserSpeechRecognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((event: SpeechRecognitionResultEvent) => void) | null; onerror: (() => void) | null; onend: (() => void) | null };
type SpeechWindow = Window & { SpeechRecognition?: new () => BrowserSpeechRecognition; webkitSpeechRecognition?: new () => BrowserSpeechRecognition };
const DOCUMENT_TYPES = new Set(['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json', 'application/rtf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']);
const MODEL_TIERS = ['lite', 'flash', 'smart'] as const;
type ModelTier = typeof MODEL_TIERS[number];
const MODEL_TIER_LABELS: Record<ModelTier, { name: string; caption: string }> = { lite: { name: 'Быстро', caption: 'Gemini Flash Lite' }, flash: { name: 'Стандарт', caption: 'Gemini Flash' }, smart: { name: 'Умнее', caption: 'Gemini 3.7 Flash' } };

interface Quota {
  limit: number;
  used: number;
  remaining: number;
  telegramLinked: boolean;
}

function MemberAiPage() {
  const imageInput = useRef<HTMLInputElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [content, setContent] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [document, setDocument] = useState<File | null>(null);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [modelTier, setModelTier] = useState<ModelTier>('lite');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [messageMenuId, setMessageMenuId] = useState<string | null>(null);
  const [archivedView, setArchivedView] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadConversations = async (archived = archivedView) => {
    const result = await apiRequest<{ conversations: Conversation[] }>(`/ai/conversations${archived ? '?archived=1' : ''}`);
    setConversations(result.conversations);
    return result.conversations;
  };
  const loadQuota = async () => setQuota(await apiRequest<Quota>('/ai/quota'));
  const loadAiSettings = async () => {
    const result = await apiRequest<{ settings: { defaultModelTier: ModelTier } }>('/ai/settings');
    setModelTier(result.settings.defaultModelTier);
  };
  const createConversation = async () => {
    const result = await apiRequest<{ conversation: Conversation }>('/ai/conversations', { method: 'POST' });
    setConversations((current) => [result.conversation, ...current]);
    setActiveId(result.conversation.id);
    setMessages([]);
    setSidebarOpen(false);
    return result.conversation;
  };
  const loadMessages = async (conversationId: string) => {
    const result = await apiRequest<{ messages: AiMessage[] }>(`/ai/conversations/${encodeURIComponent(conversationId)}/messages`);
    setMessages(result.messages);
  };

  useEffect(() => {
    void Promise.all([loadConversations(false), loadQuota(), loadAiSettings()]).then(([items]) => {
      if (items[0]) setActiveId(items[0].id);
    }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить AI.'));
  }, []);
  useEffect(() => { if (archivedView) { setActiveId(null); setMessages([]); } void loadConversations(archivedView).then((items) => { if (items[0]) setActiveId(items[0].id); }).catch(() => undefined); }, [archivedView]);
  useEffect(() => { if (activeId) void loadMessages(activeId).catch(() => setMessages([])); }, [activeId]);
  useEffect(() => { streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, sending]);
  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

  const selectAttachment = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    setError(null);
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('Вложение должно быть не больше 10 МиБ.'); return; }
    if (['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setDocument(null); setImage(file); setImagePreview(URL.createObjectURL(file));
      return;
    }
    if (!DOCUMENT_TYPES.has(file.type)) { setError('Поддерживаются изображения, PDF, TXT, Markdown, CSV, JSON, RTF и документы Office.'); return; }
    clearImage(); setDocument(file);
  };

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImage(null);
    setImagePreview(null);
  };

  const startVoiceInput = () => {
    const Recognition = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
    if (!Recognition) { setError('Голосовой ввод пока не поддерживается этим браузером.'); return; }
    const recognition = new Recognition();
    recognition.lang = 'ru-RU'; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = (event) => setContent((current) => `${current}${current ? ' ' : ''}${Array.from(event.results).map((result) => result[0]?.transcript ?? '').join(' ').trim()}`);
    recognition.onerror = () => setError('Не удалось распознать голос. Проверьте доступ к микрофону.');
    recognition.onend = () => setVoiceRecording(false);
    setVoiceRecording(true); recognition.start();
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (sending || (!content.trim() && !image && !document)) return;
    setSending(true); setError(null);
    let conversationId = activeId;
    try {
      if (!conversationId) conversationId = (await createConversation()).id;
      const form = new FormData();
      form.set('content', content.trim());
      form.set('modelTier', modelTier);
      if (image) form.set('image', image);
      if (document) form.set('document', document);
      const result = await apiRequest<{ userMessage: AiMessage; assistantMessage: AiMessage; quota: Quota }>(
        `/ai/conversations/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', body: form },
      );
      setMessages((current) => [...current, result.userMessage, result.assistantMessage]);
      setQuota(result.quota);
      setContent(''); clearImage(); setDocument(null);
      await loadConversations(false);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Gemini временно недоступна.');
      if (conversationId) await loadMessages(conversationId).catch(() => undefined);
      await loadQuota().catch(() => undefined);
    } finally { setSending(false); }
  };

  const removeConversation = async (conversationId: string) => {
    if (!window.confirm('Удалить этот AI-диалог без возможности восстановления?')) return;
    await apiRequest(`/ai/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
    const remaining = conversations.filter((conversation) => conversation.id !== conversationId);
    setConversations(remaining);
    setActiveId(remaining[0]?.id ?? null);
    if (!remaining.length) setMessages([]);
  };

  const archiveConversation = async (conversationId: string, archived: boolean) => {
    await apiRequest(`/ai/conversations/${encodeURIComponent(conversationId)}`, { method: 'PATCH', body: JSON.stringify({ archived }) });
    setChatMenuOpen(false); setActiveId(null); setMessages([]); await loadConversations(archivedView);
  };

  const removeMessage = async (message: AiMessage) => {
    if (!activeId || !window.confirm('Удалить это сообщение?')) return;
    await apiRequest(`/ai/conversations/${encodeURIComponent(activeId)}/messages/${encodeURIComponent(message.id)}`, { method: 'DELETE' });
    setMessages((current) => current.filter((item) => item.id !== message.id)); setMessageMenuId(null);
  };

  return <section className={`ai-page ${sidebarOpen ? 'ai-sidebar-open' : ''}`}>
    <aside className="ai-conversations">
      <header><div><p className="eyebrow">Tyson AI</p><strong>{archivedView ? 'Архив' : 'Диалоги'}</strong></div><span><button type="button" onClick={() => setArchivedView((value) => !value)} aria-label={archivedView ? 'Вернуться к диалогам' : 'Открыть архив'}>{archivedView ? <ArchiveRestore size={18} /> : <Archive size={18} />}</button>{!archivedView && <button type="button" onClick={() => void createConversation()} aria-label="Новый диалог"><Plus size={19} /></button>}</span></header>
      <div className="ai-conversation-list">{conversations.map((conversation) => <button className={conversation.id === activeId ? 'active' : ''} key={conversation.id} type="button" onClick={() => { setActiveId(conversation.id); setSidebarOpen(false); }}><span>{conversation.title}</span><small>{new Date(conversation.updatedAt).toLocaleDateString('ru-RU')}</small></button>)}</div>
    </aside>
    <div className="ai-chat">
      <header><button className="ai-menu-button" type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label="Диалоги"><Menu /></button><span className="ai-logo"><Sparkles /></span><div><strong>Tyson AI</strong><small>{archivedView ? 'Архив диалогов' : 'На основе Gemini'}</small></div><span className="ai-header-actions"><button type="button" onClick={() => void createConversation()} aria-label="Новый диалог"><SquarePen size={19} /></button>{activeId && <span className="ai-more-menu"><button type="button" onClick={() => setChatMenuOpen((open) => !open)} aria-label="Действия с диалогом" aria-expanded={chatMenuOpen}><MoreHorizontal size={21} /></button>{chatMenuOpen && <div role="menu"><button type="button" onClick={() => void archiveConversation(activeId, !archivedView)}>{archivedView ? <ArchiveRestore size={16} /> : <Archive size={16} />}{archivedView ? 'Вернуть из архива' : 'В архив'}</button><button type="button" onClick={() => void removeConversation(activeId)}><Trash2 size={16} />Удалить чат</button></div>}</span>}</span></header>
      <div className="ai-message-stream" ref={streamRef}>
        {!messages.length && <div className="ai-welcome"><span><Sparkles size={30} /></span><h1>Чем я могу помочь?</h1><p>Задайте вопрос, прикрепите изображение или документ. Диалог сохранится в Tyson.</p></div>}
        {messages.map((message) => <article className={`ai-message ${message.role}`} key={message.id}>
          <strong>{message.role === 'assistant' ? 'Tyson AI' : 'Вы'}</strong>
          <button className="ai-message-menu-trigger" type="button" onClick={() => setMessageMenuId((current) => current === message.id ? null : message.id)} aria-label="Действия с сообщением"><MoreHorizontal size={16} /></button>{messageMenuId === message.id && <span className="ai-message-menu"><button type="button" onClick={() => void removeMessage(message)}><Trash2 size={15} />Удалить</button></span>}
          {message.imageStorageKey && !message.attachmentName && <img src={mediaUrl(message.imageStorageKey) ?? ''} alt="Изображение в AI-диалоге" />}
          {message.imageStorageKey && message.attachmentName && <a className="ai-document" href={`${API_URL}/api/media/${encodeURIComponent(message.imageStorageKey)}`} target="_blank" rel="noreferrer"><FileText size={18} /><span><b>{message.attachmentName}</b><small>{message.attachmentContentType ?? 'Документ'} · доступен 24 часа</small></span></a>}
          {!message.imageStorageKey && Boolean(message.imageExpired) && <span className="ai-expired-image">Вложение удалено через 24 часа</span>}
          {message.content && message.role === 'assistant' ? <TextResponse><RichAiText text={message.content} /></TextResponse> : message.content && <p>{message.content}</p>}
        </article>)}
        {sending && <article className="ai-message assistant ai-thinking" aria-live="polite"><div className="ai-thinking-head"><span className="ai-thinking-dot" aria-hidden="true" /><ThinkingState /></div><p>Анализирую запрос и готовлю ответ<span>…</span></p></article>}
      </div>
      <form className={`ai-composer ${(content.trim() || image || document) ? 'ai-composer-expanded' : ''}`} onSubmit={(event) => void send(event)}>
        {imagePreview && <div className="ai-image-preview"><img src={imagePreview} alt="Выбранное изображение" /><button type="button" onClick={clearImage} aria-label="Убрать изображение"><X size={16} /></button></div>}
        {document && <div className="ai-document-preview"><FileText size={19} /><span>{document.name}<small>Документ будет удалён через 24 часа</small></span><button type="button" onClick={() => setDocument(null)} aria-label="Убрать документ"><X size={16} /></button></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div><button type="button" onClick={() => imageInput.current?.click()} disabled={sending} aria-label="Прикрепить изображение или документ"><Paperclip /></button><textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={8000} rows={1} placeholder="Спросить Tyson AI" disabled={sending || quota?.remaining === 0} /><button className="ai-model-trigger" type="button" onClick={() => setModelPickerOpen((open) => !open)} aria-label="Выбрать уровень модели" aria-expanded={modelPickerOpen}><Gauge /></button>{!(content.trim() || image || document) && <button type="button" onClick={startVoiceInput} disabled={sending || voiceRecording} aria-label="Голосовой ввод"><Mic className={voiceRecording ? 'voice-recording' : ''} /></button>}{(content.trim() || image || document) && <button className="ai-send" type="submit" disabled={sending || quota?.remaining === 0} aria-label="Отправить"><Send /></button>}</div>
        {modelPickerOpen && <section className="ai-model-slider" aria-label="Уровень модели"><div><strong>{MODEL_TIER_LABELS[modelTier].name}</strong><small>{MODEL_TIER_LABELS[modelTier].caption}</small></div><input type="range" min="0" max="2" step="1" value={MODEL_TIERS.indexOf(modelTier)} onChange={(event) => setModelTier(MODEL_TIERS[Number(event.target.value)] ?? 'lite')} aria-label="Уровень интеллекта модели" /><footer><span>Быстро</span><span>Умнее</span></footer></section>}
        <footer><span>Вложения удаляются через 24 часа</span><strong>{quota ? `${quota.remaining} из ${quota.limit} запросов сегодня` : 'Загрузка лимита…'}</strong></footer>
        <input ref={imageInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif,.pdf,.txt,.md,.csv,.json,.rtf,.doc,.docx,.xlsx,.pptx,application/pdf,text/plain,text/markdown,text/csv,application/json,application/rtf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={selectAttachment} />
      </form>
    </div>
  </section>;
}

interface GuestMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function GuestAiPage() {
  const streamRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [content, setContent] = useState('');
  const [remaining, setRemaining] = useState(3);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, sending]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const question = content.trim();
    if (!question || sending || remaining === 0) return;
    setSending(true); setError(null);
    try {
      const result = await apiRequest<{ answer: string; quota: { remaining: number } }>('/ai/guest/chat', {
        method: 'POST', body: JSON.stringify({ content: question }),
      });
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: question }, { id: crypto.randomUUID(), role: 'assistant', content: result.answer }]);
      setContent(''); setRemaining(result.quota.remaining);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Gemini временно недоступна.');
      if ((sendError as { status?: number }).status === 429) setRemaining(0);
    } finally { setSending(false); }
  };

  return <section className="ai-page ai-guest">
    <div className="ai-chat">
      <header><span className="ai-logo"><Sparkles /></span><div><strong>Tyson AI</strong><small>Gemini Flash Lite · гостевой режим</small></div></header>
      <div className="ai-message-stream" ref={streamRef}>
        {!messages.length && <div className="ai-welcome"><span><Sparkles size={30} /></span><h1>Попробуйте Tyson AI</h1><p>Три бесплатных запроса в сутки. Здесь не сохраняются история и память.</p><a className="button secondary" href="/login">Войти в Tyson</a></div>}
        {messages.map((message) => <article className={`ai-message ${message.role}`} key={message.id}>
          <strong>{message.role === 'assistant' ? 'Tyson AI' : 'Вы'}</strong>
          {message.role === 'assistant' ? <TextResponse><RichAiText text={message.content} /></TextResponse> : <p>{message.content}</p>}
        </article>)}
        {sending && <article className="ai-message assistant ai-thinking" aria-live="polite"><div className="ai-thinking-head"><span className="ai-thinking-dot" aria-hidden="true" /><ThinkingState /></div><p>Готовлю ответ<span>…</span></p></article>}
      </div>
      <form className={`ai-composer ${content.trim() ? 'ai-composer-expanded' : ''}`} onSubmit={(event) => void send(event)}>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div><textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={8000} rows={1} placeholder="Спросить Tyson AI" disabled={sending || remaining === 0} /><button className="ai-send" type="submit" disabled={sending || remaining === 0 || !content.trim()} aria-label="Отправить"><Send /></button></div>
        <footer><span>Без истории и памяти</span><strong>{remaining} из 3 запросов сегодня</strong></footer>
      </form>
    </div>
  </section>;
}

export function AiPage() {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Запускаем Tyson AI…</div>;
  return user ? <MemberAiPage /> : <GuestAiPage />;
}
