import { FileText, ImagePlus, Menu, Mic, Paperclip, Plus, Send, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ThinkingState } from '@aicss/react/thinking-state';
import { TextResponse } from '@aicss/react/text-response';
import { API_URL, apiRequest, mediaUrl } from '../api/client';

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
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

interface Quota {
  limit: number;
  used: number;
  remaining: number;
  telegramLinked: boolean;
}

export function AiPage() {
  const imageInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadConversations = async () => {
    const result = await apiRequest<{ conversations: Conversation[] }>('/ai/conversations');
    setConversations(result.conversations);
    return result.conversations;
  };
  const loadQuota = async () => setQuota(await apiRequest<Quota>('/ai/quota'));
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
    void Promise.all([loadConversations(), loadQuota()]).then(([items]) => {
      if (items[0]) setActiveId(items[0].id);
    }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить AI.'));
  }, []);
  useEffect(() => { if (activeId) void loadMessages(activeId).catch(() => setMessages([])); }, [activeId]);
  useEffect(() => { streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, sending]);
  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    setError(null);
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) { setError('Поддерживаются JPEG, PNG, WebP и AVIF.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('Изображение должно быть не больше 10 МиБ для Telegram-аккаунтов.'); return; }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setDocument(null);
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImage(null);
    setImagePreview(null);
  };

  const selectDocument = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    setError(null);
    if (!file) return;
    if (!DOCUMENT_TYPES.has(file.type)) { setError('Поддерживаются PDF, TXT, Markdown, CSV, JSON, RTF и документы Office.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('Документ должен быть не больше 10 МиБ.'); return; }
    clearImage(); setDocument(file);
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
      if (image) form.set('image', image);
      if (document) form.set('document', document);
      const result = await apiRequest<{ userMessage: AiMessage; assistantMessage: AiMessage; quota: Quota }>(
        `/ai/conversations/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', body: form },
      );
      setMessages((current) => [...current, result.userMessage, result.assistantMessage]);
      setQuota(result.quota);
      setContent(''); clearImage(); setDocument(null);
      await loadConversations();
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

  return <section className={`ai-page ${sidebarOpen ? 'ai-sidebar-open' : ''}`}>
    <aside className="ai-conversations">
      <header><div><p className="eyebrow">Tyson AI</p><strong>Диалоги</strong></div><button type="button" onClick={() => void createConversation()} aria-label="Новый диалог"><Plus size={19} /></button></header>
      <div className="ai-conversation-list">{conversations.map((conversation) => <button className={conversation.id === activeId ? 'active' : ''} key={conversation.id} type="button" onClick={() => { setActiveId(conversation.id); setSidebarOpen(false); }}><span>{conversation.title}</span><small>{new Date(conversation.updatedAt).toLocaleDateString('ru-RU')}</small></button>)}</div>
    </aside>
    <div className="ai-chat">
      <header><button className="ai-menu-button" type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label="Диалоги"><Menu /></button><span className="ai-logo"><Sparkles /></span><div><strong>Tyson AI</strong><small>На основе Gemini</small></div>{activeId && <button className="ai-delete-conversation" type="button" onClick={() => void removeConversation(activeId)} aria-label="Удалить диалог"><Trash2 size={18} /></button>}</header>
      <div className="ai-message-stream" ref={streamRef}>
        {!messages.length && <div className="ai-welcome"><span><Sparkles size={30} /></span><h1>Чем я могу помочь?</h1><p>Задайте вопрос или прикрепите изображение. Диалог сохранится в Tyson.</p></div>}
        {messages.map((message) => <article className={`ai-message ${message.role}`} key={message.id}>
          <strong>{message.role === 'assistant' ? 'Tyson AI' : 'Вы'}</strong>
          {message.imageStorageKey && !message.attachmentName && <img src={mediaUrl(message.imageStorageKey) ?? ''} alt="Изображение в AI-диалоге" />}
          {message.imageStorageKey && message.attachmentName && <a className="ai-document" href={`${API_URL}/api/media/${encodeURIComponent(message.imageStorageKey)}`} target="_blank" rel="noreferrer"><FileText size={18} /><span><b>{message.attachmentName}</b><small>{message.attachmentContentType ?? 'Документ'} · доступен 24 часа</small></span></a>}
          {!message.imageStorageKey && Boolean(message.imageExpired) && <span className="ai-expired-image">Вложение удалено через 24 часа</span>}
          {message.content && message.role === 'assistant' ? <TextResponse><p>{message.content}</p></TextResponse> : message.content && <p>{message.content}</p>}
        </article>)}
        {sending && <article className="ai-message assistant ai-thinking" aria-live="polite"><div className="ai-thinking-head"><span className="ai-thinking-dot" aria-hidden="true" /><ThinkingState /></div><p>Анализирую запрос и готовлю ответ<span>…</span></p></article>}
      </div>
      <form className="ai-composer" onSubmit={(event) => void send(event)}>
        {imagePreview && <div className="ai-image-preview"><img src={imagePreview} alt="Выбранное изображение" /><button type="button" onClick={clearImage} aria-label="Убрать изображение"><X size={16} /></button></div>}
        {document && <div className="ai-document-preview"><FileText size={19} /><span>{document.name}<small>Документ будет удалён через 24 часа</small></span><button type="button" onClick={() => setDocument(null)} aria-label="Убрать документ"><X size={16} /></button></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div><button type="button" onClick={() => imageInput.current?.click()} disabled={sending} aria-label="Добавить изображение"><ImagePlus /></button><button type="button" onClick={() => documentInput.current?.click()} disabled={sending} aria-label="Добавить документ"><Paperclip /></button><textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={8000} rows={1} placeholder="Сообщение для Tyson AI" disabled={sending || quota?.remaining === 0} /><button type="button" onClick={startVoiceInput} disabled={sending || voiceRecording} aria-label="Голосовой ввод"><Mic className={voiceRecording ? 'voice-recording' : ''} /></button><button className="ai-send" type="submit" disabled={sending || quota?.remaining === 0 || (!content.trim() && !image && !document)} aria-label="Отправить"><Send /></button></div>
        <footer><span>Изображения удаляются через 24 часа</span><strong>{quota ? `${quota.remaining} из ${quota.limit} запросов сегодня` : 'Загрузка лимита…'}</strong></footer>
        <input ref={imageInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={selectImage} />
        <input ref={documentInput} className="visually-hidden" type="file" accept=".pdf,.txt,.md,.csv,.json,.rtf,.doc,.docx,.xlsx,.pptx,application/pdf,text/plain,text/markdown,text/csv,application/json,application/rtf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={selectDocument} />
      </form>
    </div>
  </section>;
}
