import { Link } from 'react-router-dom';

export function Brand() {
  const returnToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  return <Link className="brand" to="/" onClick={returnToTop} aria-label="Tyson — главная"><img src="/logo.png" alt="" /><span>Tyson</span></Link>;
}
