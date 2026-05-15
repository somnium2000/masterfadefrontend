import { memo } from 'react';
import LoadingSpinner from '../../../../components/data/LoadingSpinner.jsx';

const BookingLoadingState = memo(function BookingLoadingState() {
  return (
    <div className="public-booking-loading">
      <LoadingSpinner />
    </div>
  );
});

export default BookingLoadingState;
