const DEFAULT_TIMEZONE = 'UTC';

// ─────────────────────────────────────
// Validate IANA timezone
// Example:
// Asia/Karachi
// America/New_York
// Europe/London
// ─────────────────────────────────────

const isValidTimezone = (timezone) => {
  try {
    Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
    }).format();

    return true;
  } catch {
    return false;
  }
};

// ─────────────────────────────────────
// Get timezone from request
// ─────────────────────────────────────

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

// ─────────────────────────────────────
// Get local date parts
// ─────────────────────────────────────

const getLocalDateParts = (
  timezone,
  date = new Date()
) => {
  const formatter =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }
    );

  const parts =
    formatter.formatToParts(date);

  const getPart = (type) =>
    Number(
      parts.find(
        (part) =>
          part.type === type
      )?.value
    );

  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
  };
};

// ─────────────────────────────────────
// YYYY-MM-DD in user's timezone
// ─────────────────────────────────────

const getLocalDate = (
  timezone,
  date = new Date()
) => {
  const {
    year,
    month,
    day,
  } = getLocalDateParts(
    timezone,
    date
  );

  return [
    year,
    String(month).padStart(
      2,
      '0'
    ),
    String(day).padStart(
      2,
      '0'
    ),
  ].join('-');
};

// ─────────────────────────────────────
// Get timezone offset in milliseconds
// ─────────────────────────────────────

const getTimezoneOffsetMs = (
  timezone,
  date
) => {
  const formatter =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone: timezone,

        year: 'numeric',
        month: '2-digit',
        day: '2-digit',

        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',

        hourCycle: 'h23',
      }
    );

  const parts =
    formatter.formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (
      part.type !== 'literal'
    ) {
      values[part.type] =
        Number(part.value);
    }
  }

  const utcEquivalent =
    Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second
    );

  return (
    utcEquivalent -
    date.getTime()
  );
};

// ─────────────────────────────────────
// Convert local timezone datetime
// into real UTC datetime
// ─────────────────────────────────────

const zonedDateTimeToUtc = (
  timezone,
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0
) => {
  const guessedUtc =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        hour,
        minute,
        second
      )
    );

  let offset =
    getTimezoneOffsetMs(
      timezone,
      guessedUtc
    );

  let result =
    new Date(
      guessedUtc.getTime() -
        offset
    );

  // Second pass for DST correction
  const correctedOffset =
    getTimezoneOffsetMs(
      timezone,
      result
    );

  if (
    correctedOffset !== offset
  ) {
    result =
      new Date(
        guessedUtc.getTime() -
          correctedOffset
      );
  }

  return result;
};

// ─────────────────────────────────────
// Get UTC range for user's local day
//
// Example New York:
// Local 00:00 → correct UTC start
// Next local 00:00 → correct UTC end
// ─────────────────────────────────────

const getUtcDayRange = (
  timezone,
  date = new Date()
) => {
  const safeTimezone =
    isValidTimezone(timezone)
      ? timezone
      : DEFAULT_TIMEZONE;

  const {
    year,
    month,
    day,
  } = getLocalDateParts(
    safeTimezone,
    date
  );

  const start =
    zonedDateTimeToUtc(
      safeTimezone,
      year,
      month,
      day
    );

  // Next calendar day
  const nextDayDate =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day + 1
      )
    );

  const nextYear =
    nextDayDate
      .getUTCFullYear();

  const nextMonth =
    nextDayDate
      .getUTCMonth() + 1;

  const nextDay =
    nextDayDate
      .getUTCDate();

  const end =
    zonedDateTimeToUtc(
      safeTimezone,
      nextYear,
      nextMonth,
      nextDay
    );

  return {
    start:
      start.toISOString(),

    end:
      end.toISOString(),
  };
};

// ─────────────────────────────────────
// Yesterday in user's timezone
// ─────────────────────────────────────

const getYesterdayLocalDate = (
  timezone
) => {
  const safeTimezone =
    isValidTimezone(timezone)
      ? timezone
      : DEFAULT_TIMEZONE;

  const {
    year,
    month,
    day,
  } = getLocalDateParts(
    safeTimezone
  );

  const previousDate =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day - 1
      )
    );

  return [
    previousDate
      .getUTCFullYear(),

    String(
      previousDate
        .getUTCMonth() + 1
    ).padStart(
      2,
      '0'
    ),

    String(
      previousDate
        .getUTCDate()
    ).padStart(
      2,
      '0'
    ),
  ].join('-');
};

module.exports = {
  getTimezone,
  getLocalDate,
  getUtcDayRange,
  getYesterdayLocalDate,
  isValidTimezone,
};