const DEFAULT_TIMEZONE = 'UTC';

// Validate IANA timezone
const isValidTimezone = (timezone) => {
  try {
    Intl.DateTimeFormat(
      'en-US',
      {
        timeZone: timezone,
      }
    ).format();

    return true;
  } catch {
    return false;
  }
};

// Get timezone from request header
const getTimezone = (req) => {
  const timezone =
    typeof req.headers['x-timezone'] === 'string'
      ? req.headers['x-timezone'].trim()
      : '';

  if (
    timezone &&
    isValidTimezone(timezone)
  ) {
    return timezone;
  }

  return DEFAULT_TIMEZONE;
};

// Get YYYY-MM-DD in user's timezone
const getLocalDate = (
  timezone,
  date = new Date()
) => {
  const formatter =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }
    );

  const parts =
    formatter.formatToParts(date);

  const year =
    parts.find(
      (part) => part.type === 'year'
    )?.value;

  const month =
    parts.find(
      (part) => part.type === 'month'
    )?.value;

  const day =
    parts.find(
      (part) => part.type === 'day'
    )?.value;

  return `${year}-${month}-${day}`;
};

// Get yesterday YYYY-MM-DD
const getYesterdayLocalDate = (
  timezone
) => {
  const now = new Date();

  const yesterday =
    new Date(
      now.getTime() -
        24 * 60 * 60 * 1000
    );

  return getLocalDate(
    timezone,
    yesterday
  );
};

module.exports = {
  getTimezone,
  getLocalDate,
  getYesterdayLocalDate,
  isValidTimezone,
};