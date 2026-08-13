import { ChevronLeft, Send, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiRequest } from '../api/client';

interface AiConversation { id: string; title: string; updatedAt: string }
interface AiMessage { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }
interface AiQuota { limit: number; used: number; remaining: number; telegramLinked: boolean }

export function MessengerAiChat({ onBack }: { onBack(): void }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [quota, setQuota] = useState<AiQuota | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void Promise.all([
      apiRequest<{ conversations: AiConversation[] }>('/ai/conversations'),
      apiRequest<AiQuota>('/ai/quota'),
    ]).then(async ([history, nextQuota]) => {
      setQuota(nextQuota);
      const latest = history.conversations[0];
      if (!latest) return;
      setConversationId(latest.id);
      const result = await apiRequest<{ messages: AiMessage[] }>(`/ai/conversations/${encodeURIComponent(latest.id)}/messages`);
      setMessages(result.messages);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Не удалось открыть Tyson AI.'));
  }, []);

  useEffect(() => {
    stream.current?.scrollTo({ top: stream.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const createConversation = async () => {
    const result = await apiRequest<{ conversation: AiConversation }>('/ai/conversations', { method: 'POST' });
    setConversationId(result.conversation.id);
    return result.conversation.id;
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending || quota?.remaining === 0) return;
    setSending(true);
    setError(null);
    try {
      const activeId = conversationId ?? await createConversation();
      const form = new FormData();
      form.set('content', content);
      const result = await apiRequest<{ userMessage: AiMessage; assistantMessage: AiMessage; quota: AiQuota }>(
        `/ai/conversations/${encodeURIComponent(activeId)}/messages`, { method: 'POST', body: form },
      );
      setMessages((current) => [...current, result.userMessage, result.assistantMessage]);
      setQuota(result.quota);
      setDraft('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Tyson AI временно недоступен.');
    } finally {
      setSending(false);
    }
  };

  const reset = async () => {
    if (!conversationId || !window.confirm('Очистить этот диалог с Tyson AI?')) return;
    setSending(true);
    try {
      await apiRequest(`/ai/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
      setConversationId(null);
      setMessages([]);
      setDraft('');
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось очистить диалог.');
    } finally {
      setSending(false);
    }
  };

  return <div className="messenger-ai-chat">
    <header>
      <button className="mobile-chat-back" type="button" aria-label="Вернуться к диалогам" onClick={onBack}><ChevronLeft /></button>
      <span className="messenger-ai-avatar"><Sparkles /></span>
      <div><strong>Tyson AI</strong><small>На основе Gemini</small></div>
      <button className="messenger-ai-reset" type="button" disabled={!conversationId || sending} onClick={() => void reset()} aria-label="Очистить диалог"><Trash2 /></button>
    </header>
    <div className="messenger-ai-stream" ref={stream}>
      {!messages.length && <div className="messenger-ai-welcome"><span><Sparkles /></span><strong>Tyson AI в сообщениях</strong><p>Пишите как обычному собеседнику. Используется общий дневной лимит Tyson AI.</p></div>}
      {messages.map((message) => <article className={`messenger-ai-message ${message.role}`} key={message.id}><strong>{message.role === 'assistant' ? 'Tyson AI' : 'Вы'}</strong><p>{message.content}</p><small>{new Date(message.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small></article>)}
      {sending && <article className="messenger-ai-message assistant thinking"><strong>Tyson AI</strong><p>Думаю…</p></article>}
    </div>
    <form className="messenger-ai-composer" onSubmit={(event) => void send(event)}>
      {error && <p role="alert">{error}</p>}
      <div><textarea rows={1} maxLength={8000} value={draft} disabled={sending || quota?.remaining === 0} onChange={(event) => setDraft(event.target.value)} placeholder="Сообщение для Tyson AI" /><button type="submit" disabled={sending || quota?.remaining === 0 || !draft.trim()} aria-label="Отправить"><Send /></button></div>
      <small>{quota ? `${quota.remaining} из ${quota.limit} запросов сегодня` : 'Загрузка лимита…'}</small>
    </form>
  </div>;
}
