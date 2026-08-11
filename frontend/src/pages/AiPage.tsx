import { ImagePlus, Menu, Plus, Send, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { apiRequest, mediaUrl } from '../api/client';

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
  imageExpired: boolean | number;
  modelVersion?: string | null;
  createdAt: string;
}

interface Quota {
  limit: number;
  used: number;
  remaining: number;
  telegramLinked: boolean;
}

export function AiPage() {
  const imageInput = useRef<HTMLInputElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [content, setContent] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
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
    if (file.size > 5 * 1024 * 1024) { setError('Изображение должно быть не больше 5 МиБ.'); return; }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImage(null);
    setImagePreview(null);
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (sending || (!content.trim() && !image)) return;
    setSending(true); setError(null);
    let conversationId = activeId;
    try {
      if (!conversationId) conversationId = (await createConversation()).id;
      const form = new FormData();
      form.set('content', content.trim());
      if (image) form.set('image', image);
      const result = await apiRequest<{ userMessage: AiMessage; assistantMessage: AiMessage; quota: Quota }>(
        `/ai/conversations/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', body: form },
      );
      setMessages((current) => [...current, result.userMessage, result.assistantMessage]);
      setQuota(result.quota);
      setContent(''); clearImage();
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
      <header><button className="ai-menu-button" type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label="Диалоги"><Menu /></button><span className="ai-logo"><Sparkles /></span><div><strong>Tyson AI</strong><small>Gemini 3.5 Flash Lite</small></div>{activeId && <button className="ai-delete-conversation" type="button" onClick={() => void removeConversation(activeId)} aria-label="Удалить диалог"><Trash2 size={18} /></button>}</header>
      <div className="ai-message-stream" ref={streamRef}>
        {!messages.length && <div className="ai-welcome"><span><Sparkles size={30} /></span><h1>Чем я могу помочь?</h1><p>Задайте вопрос или прикрепите изображение. Диалог сохранится в Tyson.</p></div>}
        {messages.map((message) => <article className={`ai-message ${message.role}`} key={message.id}>
          <strong>{message.role === 'assistant' ? 'Tyson AI' : 'Вы'}</strong>
          {message.imageStorageKey && <img src={mediaUrl(message.imageStorageKey) ?? ''} alt="Изображение в AI-диалоге" />}
          {!message.imageStorageKey && Boolean(message.imageExpired) && <span className="ai-expired-image">Изображение удалено через 24 часа</span>}
          {message.content && <p>{message.content}</p>}
        </article>)}
        {sending && <article className="ai-message assistant ai-thinking"><strong>Tyson AI</strong><p>Думаю<span>…</span></p></article>}
      </div>
      <form className="ai-composer" onSubmit={(event) => void send(event)}>
        {imagePreview && <div className="ai-image-preview"><img src={imagePreview} alt="Выбранное изображение" /><button type="button" onClick={clearImage} aria-label="Убрать изображение"><X size={16} /></button></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div><button type="button" onClick={() => imageInput.current?.click()} disabled={sending} aria-label="Добавить изображение"><ImagePlus /></button><textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={8000} rows={1} placeholder="Сообщение для Tyson AI" disabled={sending || quota?.remaining === 0} /><button className="ai-send" type="submit" disabled={sending || quota?.remaining === 0 || (!content.trim() && !image)} aria-label="Отправить"><Send /></button></div>
        <footer><span>Изображения удаляются через 24 часа</span><strong>{quota ? `${quota.remaining} из ${quota.limit} запросов сегодня` : 'Загрузка лимита…'}</strong></footer>
        <input ref={imageInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={selectImage} />
      </form>
    </div>
  </section>;
}
