import { House } from 'lucide-react';
import { Link } from 'react-router-dom';
import MasterfadeLogo from '../branding/MasterfadeLogo.jsx';
import ThemeSwitcher from '../theme/ThemeSwitcher.jsx';
import './NavigationHeader.css';

export default function PublicNavigationHeader({
  homePath = '/',
  homeLabel = 'Volver al inicio',
  onHome,
  booking = false,
  backControl,
  className = '',
}) {
  const homeContent = (
    <>
      <House size={17} strokeWidth={1.8} aria-hidden="true" />
      <span className={booking && backControl ? 'sr-only min-[520px]:not-sr-only' : undefined}>{homeLabel}</span>
    </>
  );
  const homeClass = 'mf-header-control mf-focus-ring';
  const home = onHome ? (
    <button type="button" className={homeClass} onClick={onHome}>{homeContent}</button>
  ) : (
    <Link to={homePath} className={homeClass}>{homeContent}</Link>
  );

  return (
    <header className={`mf-header-surface mf-public-header ${className}`.trim()}>
      <MasterfadeLogo variant="navigation" className="mf-public-header-brand" />
      <div className="mf-public-header-leading">{booking ? backControl : home}</div>
      <div className="mf-public-header-actions mf-header-controls">
        {booking ? home : null}
        <ThemeSwitcher showLabel={!booking} labelClassName="sr-only lg:not-sr-only" />
      </div>
    </header>
  );
}
