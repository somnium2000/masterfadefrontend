import { memo } from 'react';
import { ArrowLeft, House } from 'lucide-react';
import { Link } from 'react-router-dom';
import MasterfadeLogo from '../../../../components/branding/MasterfadeLogo.jsx';
import { Button } from '../../../../components/ui/button.jsx';
import ThemeSwitcher from '../../../../components/theme/ThemeSwitcher.jsx';
import BookingErrorState from './BookingErrorState.jsx';
import BookingLoadingState from './BookingLoadingState.jsx';

const BookingLayout = memo(function BookingLayout({
  children,
  homePath,
  homeLabel = 'Inicio MasterFade',
  loading = false,
  error = '',
  onRetry,
  showBackToBarberos = false,
  onBackToBarberos,
}) {
  return (
    <div className="public-booking-page mf-page-gradient min-h-screen">
      <div className="public-booking-shell">
        <header className="public-booking-topbar">
          <div className="public-booking-topbar-left">
            {showBackToBarberos ? (
              <Button
                variant="outline"
                className="public-booking-topbar-control public-booking-topbar-back"
                onClick={onBackToBarberos}
                aria-label="Volver a barberos"
              >
                <ArrowLeft size={18} aria-hidden="true" />
                <span className="public-booking-topbar-label">Volver a barberos</span>
              </Button>
            ) : null}
          </div>

          <MasterfadeLogo variant="topbar" className="public-booking-topbar-logo" />

          <div className="public-booking-topbar-actions">
            <Link
              to={homePath}
              className="public-booking-topbar-control public-booking-home"
              aria-label={homeLabel}
            >
              <House size={18} aria-hidden="true" />
              <span className="public-booking-topbar-label">{homeLabel}</span>
            </Link>
            <ThemeSwitcher
              showLabel={false}
              className="public-booking-theme-switcher"
              buttonClassName="public-booking-theme-button"
            />
          </div>
        </header>

        {loading ? <BookingLoadingState /> : null}
        {error ? <BookingErrorState message={error} onRetry={onRetry} /> : null}
        {children}
      </div>
    </div>
  );
});

export default BookingLayout;
