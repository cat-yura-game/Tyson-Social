import { BellRing, ChevronRight, X } from 'lucide-react';
import { useEffect, useState } from 'react';

function isIosBrowser() {
  const platform = navigator.platform;
  return /iPad|iPhone|iPod/u.test(navigator.userAgent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function IosPwaInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  useEffect(() => {
    if (isIosBrowser() && !isStandalone() && sessionStorage.getItem('tyson-pwa-prompt-dismissed') !== '1') setVisible(true);
  }, []);

  if (!visible) return null;
  return <>
    <aside className="ios-pwa-prompt" aria-label="Установите Tyson"><span className="ios-pwa-prompt-logo"><img src="/logo.png" alt="" /></span><div><strong>Установите Tyson</strong><p>Получайте уведомления и открывайте соцсеть как приложение.</p><button type="button" onClick={() => setInstructionsOpen(true)}>Как установить <ChevronRight size={15} /></button></div><button className="ios-pwa-close" type="button" aria-label="Закрыть" onClick={() => { sessionStorage.setItem('tyson-pwa-prompt-dismissed', '1'); setVisible(false); }}><X size={17} /></button></aside>
    {instructionsOpen && <div className="ios-pwa-modal-backdrop" role="presentation" onMouseDown={() => setInstructionsOpen(false)}><section className="ios-pwa-modal" role="dialog" aria-modal="true" aria-labelledby="ios-pwa-title" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">iOS 26 и новее</p><h2 id="ios-pwa-title">Установите Tyson</h2></div><button type="button" aria-label="Закрыть инструкцию" onClick={() => setInstructionsOpen(false)}><X size={20} /></button></header><p className="ios-pwa-intro"><BellRing size={17} />После установки можно включить уведомления от Tyson.</p><ol className="ios-pwa-steps"><li><div><b>Нажмите «…»</b><p>Кнопка находится справа в нижней панели Safari.</p></div><img className="ios-pwa-menu-icon" src="/pwa-install-ios-26-step1.jpg" alt="Кнопка с тремя точками" /></li><li><div><b>Выберите «Поделиться»</b></div><img src="/pwa-install-ios-26-step2.jpg" alt="Пункт Поделиться в меню Safari" /></li><li><div><b>Пролистайте меню и нажмите «Добавить на экран „Домой“»</b></div><img src="/pwa-install-ios-26-step3.jpg" alt="Пункт Добавить на экран Домой" /></li></ol><button className="primary-button" type="button" onClick={() => setInstructionsOpen(false)}>Понятно</button></section></div>}
  </>;
}
