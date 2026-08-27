import { Link } from 'react-router-dom';

export function Brand() {
  const returnToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  return <Link className="brand" to="/" onClick={returnToTop} aria-label="Tyson — главная"><img src="/logo.png" alt="" /><img className="brand-wordmark brand-wordmark-light" src="/tyson-wordmark-light.png" alt="Tyson" /><img className="brand-wordmark brand-wordmark-dark" src="/tyson-wordmark-dark.png" alt="Tyson" /></Link>;
}
