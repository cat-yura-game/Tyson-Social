const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');
const header = document.querySelector('.site-header');

const updateFloatingHeader = () => {
  header?.classList.toggle('floating', window.scrollY > 36);
};

updateFloatingHeader();
window.addEventListener('scroll', updateFloatingHeader, { passive: true });

header?.addEventListener('pointermove', (event) => {
  const bounds = header.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / bounds.width) * 100;
  const y = ((event.clientY - bounds.top) / bounds.height) * 100;
  header.style.setProperty('--glass-x', `${x}%`);
  header.style.setProperty('--glass-y', `${y}%`);
});

header?.addEventListener('pointerleave', () => {
  header.style.setProperty('--glass-x', '50%');
  header.style.setProperty('--glass-y', '0%');
});

menuButton?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});

nav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuButton?.setAttribute('aria-expanded', 'false');
  });
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

const glow = document.querySelector('.cursor-glow');
window.addEventListener('pointermove', (event) => {
  if (glow) {
    glow.style.left = `${event.clientX}px`;
    glow.style.top = `${event.clientY}px`;
  }
}, { passive: true });

document.querySelectorAll('.accordion details').forEach((item) => {
  item.addEventListener('toggle', () => {
    if (!item.open) return;
    document.querySelectorAll('.accordion details').forEach((other) => {
      if (other !== item) other.open = false;
    });
  });
});

const periodButtons = document.querySelectorAll('.period-switch button');
const paidPlanCards = document.querySelectorAll('.plan-card[data-plan]');
const periodNotes = document.querySelectorAll('[data-period-note]');

periodButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const period = button.dataset.period;

    periodButtons.forEach((item) => {
      const selected = item === button;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });

    paidPlanCards.forEach((card) => {
      const price = card.dataset[`price${period}`];
      const regular = card.dataset[`regular${period}`];
      const priceBox = card.querySelector('.price');
      card.querySelector('.plan-duration').textContent = `${period} дней`;
      priceBox.querySelector('strong').textContent = price;
      priceBox.querySelector('del').textContent = regular || '';
      priceBox.classList.toggle('discount-price', Boolean(regular));
    });

    periodNotes.forEach((note) => {
      note.hidden = note.dataset.periodNote !== period;
    });
  });
});

document.getElementById('year').textContent = new Date().getFullYear();

const chatLauncher = document.querySelector('.ai-chat-launcher');
const chatPanel = document.querySelector('.ai-chat-panel');
const chatClose = document.querySelector('.ai-chat-close');
const chatForm = document.querySelector('.ai-chat-form');
const chatInput = document.querySelector('#ai-chat-input');
const chatMessages = document.querySelector('.ai-chat-messages');
const chatSuggestions = document.querySelectorAll('.ai-chat-suggestions button');
const chatHistory = [];

const setChatOpen = (open) => {
  chatPanel.hidden = !open;
  chatLauncher.setAttribute('aria-expanded', String(open));
  if (open) window.setTimeout(() => chatInput.focus(), 80);
};

chatLauncher?.addEventListener('click', () => setChatOpen(chatPanel.hidden));
chatClose?.addEventListener('click', () => setChatOpen(false));

const addChatMessage = (text, role, extraClass = '') => {
  const message = document.createElement('div');
  message.className = `ai-chat-message ${role} ${extraClass}`.trim();
  message.textContent = text;
  chatMessages.append(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return message;
};

const getChatClientId = () => {
  const storageKey = 'zashugannyy-ai-chat-client';
  let id = localStorage.getItem(storageKey);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(storageKey, id);
  }
  return id;
};

const askAboutBot = async (question) => {
  addChatMessage(question, 'user');
  chatHistory.push({ role: 'user', content: question });
  const loading = addChatMessage('Думаю', 'assistant', 'loading');
  const submitButton = chatForm.querySelector('button');
  submitButton.disabled = true;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chat-Client': getChatClientId(),
      },
      body: JSON.stringify({ messages: chatHistory.slice(-8) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось получить ответ.');
    loading.remove();
    addChatMessage(data.answer, 'assistant');
    chatHistory.push({ role: 'assistant', content: data.answer });
  } catch (error) {
    loading.remove();
    const localHint = location.protocol === 'file:' ? ' Чат заработает после публикации сайта через Cloudflare.' : '';
    addChatMessage(`${error.message}${localHint}`, 'assistant');
    chatHistory.pop();
  } finally {
    submitButton.disabled = false;
    chatInput.focus();
  }
};

chatForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const question = chatInput.value.trim();
  if (!question) return;
  chatInput.value = '';
  askAboutBot(question);
});

chatInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

chatSuggestions.forEach((button) => {
  button.addEventListener('click', () => askAboutBot(button.textContent));
});
