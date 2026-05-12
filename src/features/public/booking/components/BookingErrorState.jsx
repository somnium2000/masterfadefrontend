import { memo } from 'react';
import ErrorBanner from '../../../../components/data/ErrorBanner.jsx';

const BookingErrorState = memo(function BookingErrorState({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="public-booking-error">
      <ErrorBanner message={message} onRetry={onRetry} />
    </div>
  );
});

export default BookingErrorState;
