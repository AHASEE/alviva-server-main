const {
  getUtcDayRange,
} = require('./timezone');

const FREE_DAILY_SCAN_LIMIT = 5;

const getDailyScanUsage = async (
  supabase,
  userId,
  timezone
) => {
  const {
    start,
    end,
  } = getUtcDayRange(timezone);

  const {
    count,
    error,
  } = await supabase
    .from('scans')
    .select('id', {
      count: 'exact',
      head: true,
    })
    .eq('user_id', userId)
    .gte('scanned_at', start)
    .lt('scanned_at', end);

  if (error) {
    throw error;
  }

  const used =
    Math.max(
      Number(count) || 0,
      0
    );

  return {
    plan: 'free',
    limit: FREE_DAILY_SCAN_LIMIT,
    used,
    remaining:
      Math.max(
        FREE_DAILY_SCAN_LIMIT - used,
        0
      ),
    resetsDaily: true,
  };
};

module.exports = {
  FREE_DAILY_SCAN_LIMIT,
  getDailyScanUsage,
};
