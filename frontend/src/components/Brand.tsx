import { Link } from 'react-router-dom';

export function Brand() {
  return <Link className="brand" to="/" aria-label="Tyson — главная"><img src="/logo.png" alt="" /><span>Tyson</span></Link>;
}
