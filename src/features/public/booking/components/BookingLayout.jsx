import { memo } from 'react';
import { ArrowLeft } from 'lucide-react';
import PublicNavigationHeader from '../../../../components/layout/PublicNavigationHeader.jsx';
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
  onHome,
}) {
  return (
    <div className="public-booking-page mf-page-gradient min-h-screen">
      <div className="public-booking-shell">
        <PublicNavigationHeader
          className="public-booking-topbar"
          booking
          homePath={homePath}
          homeLabel={homeLabel}
          onHome={onHome}
          backControl={showBackToBarberos ? (
            <button type="button" className="mf-header-control mf-focus-ring" onClick={onBackToBarberos}>
              <ArrowLeft size={17} strokeWidth={1.8} aria-hidden="true" />
              Volver a barberos
            </button>
          ) : null}
        />

        {loading ? <BookingLoadingState /> : null}
        {error ? <BookingErrorState message={error} onRetry={onRetry} /> : null}
        {children}
      </div>
    </div>
  );
});

export default BookingLayout;
