import { memo } from 'react';

const BookingStepHeader = memo(function BookingStepHeader({
  kicker = '',
  title,
  subtitle = '',
  headingLevel = 'h1',
  titleClassName = 'public-booking-title',
  subtitleClassName = 'public-booking-subtitle',
  className = '',
}) {
  const Heading = headingLevel;
  return (
    <header className={className || undefined}>
      {kicker ? <p className="public-booking-kicker">{kicker}</p> : null}
      {title ? <Heading className={titleClassName}>{title}</Heading> : null}
      {subtitle ? <p className={subtitleClassName}>{subtitle}</p> : null}
    </header>
  );
});

export default BookingStepHeader;
