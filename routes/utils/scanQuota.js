const {
  getLocalDate,
} = require('./timezone');

const FREE_DAILY_SCAN_LIMIT = 5;

const DATE_KEY =
  'alviva_daily_scan_date';

const USED_KEY =
  'alviva_daily_scan_used';

const getUsageRecord = async (
  supabase,
  userId,
  timezone
) => {
  const {
    data,
    error,
  } =
    await supabase.auth.admin
      .getUserById(userId);

  if (error || !data?.user) {
    throw (
      error ||
      new Error(
        'Unable to load scan quota'
      )
    );
  }

  const appMetadata =
    data.user.app_metadata || {};

  const today =
    getLocalDate(timezone);

  const storedDate =
    typeof appMetadata[DATE_KEY] ===
      'string'
      ? appMetadata[DATE_KEY]
      : '';

  const storedUsed =
    Math.max(
      Number(
        appMetadata[USED_KEY]
      ) || 0,
      0
    );

  const used =
    storedDate === today
      ? storedUsed
      : 0;

  return {
    user: data.user,
    appMetadata,
    today,
    used,
  };
};

const buildQuota = (used) => ({
  plan: 'free',
  limit: FREE_DAILY_SCAN_LIMIT,
  used,
  remaining:
    Math.max(
      FREE_DAILY_SCAN_LIMIT - used,
      0
    ),
  resetsDaily: true,
});

const getDailyScanUsage = async (
  supabase,
  userId,
  timezone
) => {
  const record =
    await getUsageRecord(
      supabase,
      userId,
      timezone
    );

  return buildQuota(
    record.used
  );
};

const consumeDailyScan = async (
  supabase,
  userId,
  timezone
) => {
  const record =
    await getUsageRecord(
      supabase,
      userId,
      timezone
    );

  if (
    record.used >=
    FREE_DAILY_SCAN_LIMIT
  ) {
    return buildQuota(
      record.used
    );
  }

  const nextUsed =
    record.used + 1;

  const {
    error,
  } =
    await supabase.auth.admin
      .updateUserById(
        userId,
        {
          app_metadata: {
            ...record.appMetadata,
            [DATE_KEY]:
              record.today,
            [USED_KEY]:
              nextUsed,
          },
        }
      );

  if (error) {
    throw error;
  }

  return buildQuota(
    nextUsed
  );
};

module.exports = {
  FREE_DAILY_SCAN_LIMIT,
  getDailyScanUsage,
  consumeDailyScan,
};
