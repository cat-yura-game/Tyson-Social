import { Diamond, Gift, ListChecks, ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client';

export function DiamondsPage() {
  const [balance, setBalance] = useState(0);
  useEffect(() => { void apiRequest<{ balance: number }>('/diamonds/balance').then((data) => setBalance(data.balance)).catch(() => undefined); }, []);
  return <section className="diamonds-page"><header className="diamonds-hero"><div className="diamond-sparkles" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div><Diamond className="diamonds-hero-icon" fill="currentColor" /><h1>Алмазы Tyson</h1><p>Ваш баланс и возможности Tyson в одном месте.</p><section className="diamonds-balance-card" aria-label="Ваш баланс"><Diamond fill="currentColor" /><strong>{balance}</strong><span>Ваш баланс</span></section><Link className="diamonds-earn-button" to="/earn"><ListChecks size={18} />Заработать</Link></header><section className="diamonds-choice"><span>Алмазы Tyson</span><h2>На что хотите потратить?</h2><p>Выберите действие — подарки и вторичный рынок доступны отдельно.</p><div><Link to="/gift-shop"><Gift /><strong>Купить или отправить подарок</strong><small>Подарок себе или другому пользователю</small></Link><Link to="/gift-shop#market"><ShoppingBag /><strong>Вторичный рынок</strong><small>Коллекционные подарки от других пользователей</small></Link></div></section></section>;
}
