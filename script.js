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
