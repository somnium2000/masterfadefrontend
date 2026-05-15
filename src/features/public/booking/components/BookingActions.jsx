import { memo } from 'react';

const BookingActions = memo(function BookingActions({
  children,
  inline = false,
  className = '',
}) {
  const classes = [
    'public-booking-actions',
    inline ? 'is-inline' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {children}
    </div>
  );
});

export default BookingActions;
