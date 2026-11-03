/** IST-aware helpers. The exchange trades 09:15–15:30 IST, Mon–Fri. */

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const SESSION_START_MINUTES = 9 * 60 + 15;
export const SESSION_END_MINUTES = 15 * 60 + 30;
export const ONE_MINUTE_MS = 60 * 1000;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const istDate = (date) => new Date(date.getTime() + IST_OFFSET_MS);

/** UTC instant for a given IST wall-clock time on the same IST calendar day. */
export function istTimeToUtc(referenceDate, hours, minutes = 0) {
  const ist = istDate(referenceDate);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), hours, minutes) - IST_OFFSET_MS
  );
}

export function sessionStartUtc(referenceDate) {
  return istTimeToUtc(referenceDate, 9, 15);
}

export function sessionEndUtc(referenceDate) {
  return istTimeToUtc(referenceDate, 15, 30);
}

export function isWeekday(date) {
  const day = istDate(date).getUTCDay();
  return day >= 1 && day <= 5;
}

export function isMarketOpen(now = new Date()) {
  if (!isWeekday(now)) return false;
  const ist = istDate(now);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minutes >= SESSION_START_MINUTES && minutes <= SESSION_END_MINUTES;
}

/** Most recent session start at or before `now`. */
export function latestSessionStart(now = new Date()) {
  let candidate = sessionStartUtc(now);
  if (!isWeekday(now) || now < candidate) {
    let probe = new Date(now.getTime() - ONE_DAY_MS);
    while (!isWeekday(probe)) probe = new Date(probe.getTime() - ONE_DAY_MS);
    candidate = sessionStartUtc(probe);
  }
  return candidate;
}

/** The trading session `n` weekdays before `sessionStart`. */
export function previousSessionStart(sessionStart, n = 1) {
  let probe = new Date(sessionStart.getTime());
  let remaining = n;
  while (remaining > 0) {
    probe = new Date(probe.getTime() - ONE_DAY_MS);
    if (isWeekday(probe)) remaining -= 1;
  }
  return sessionStartUtc(probe);
}

export function floorTo(date, intervalMs) {
  return new Date(Math.floor(date.getTime() / intervalMs) * intervalMs);
}

export const INTERVAL_MS = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': ONE_DAY_MS
};

/** Maps the API's range token to the millisecond lookback used for comparisons. */
export const RANGE_LOOKBACK_MS = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000
};
