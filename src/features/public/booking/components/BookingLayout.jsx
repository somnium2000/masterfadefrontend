import { memo } from 'react';
import { ArrowLeft, House } from 'lucide-react';
import { Link } from 'react-router-dom';
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
            <Link to={homePath} className="public-booking-home">
              <House size={16} />
              <span>{homeLabel}</span>
            </Link>
            {showBackToBarberos ? (
              <Button
                variant="outline"
                size="sm"
                className="public-booking-topbar-back gap-2"
                onClick={onBackToBarberos}
              >
                <ArrowLeft size={15} />
                Volver a barberos
              </Button>
            ) : null}
          </div>
          <ThemeSwitcher showLabel={false} />
        </header>

        {loading ? <BookingLoadingState /> : null}
        {error ? <BookingErrorState message={error} onRetry={onRetry} /> : null}
        {children}
      </div>
    </div>
  );
});

export default BookingLayout;
