export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the UTC Date corresponding to 00:00:00.000 in the target timezone
 * on the given date (formatted as yyyy-mm-dd).
 */
export function getLocalMidnightInUtc(dateStr: string, tz: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  
  // Base guess: Midnight of that day in UTC
  const guessTime = Date.UTC(year, month - 1, day);
  
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const getLocalTime = (t: number) => {
    const parts = formatter.formatToParts(new Date(t));
    const p: Record<string, string> = {};
    for (const part of parts) {
      p[part.type] = part.value;
    }
    let hr = parseInt(p.hour || "0");
    if (hr === 24) hr = 0;
    return {
      year: parseInt(p.year || "0"),
      month: parseInt(p.month || "0"),
      day: parseInt(p.day || "0"),
      hour: hr,
      minute: parseInt(p.minute || "0"),
      second: parseInt(p.second || "0"),
    };
  };

  const local = getLocalTime(guessTime);
  const localTimeAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  const offset = guessTime - localTimeAsUtc;
  
  return new Date(guessTime + offset);
}

/**
 * Given a point in time (now) and a target timezone, returns the UTC dates
 * representing the start of the current local day and the start of the next local day.
 */
export function getLocalDayBounds(now: Date, tz: string): { startOfDay: Date; resetAt: Date } {
  // Format current time to get the year, month, day components in the target timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(now);
  const getVal = (name: string) => parts.find(p => p.type === name)!.value;
  
  const year = parseInt(getVal("year"));
  const month = parseInt(getVal("month"));
  const day = parseInt(getVal("day"));
  
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const startOfDay = getLocalMidnightInUtc(dateStr, tz);

  // Get next local day's midnight. Adding 25 hours is safe for finding a time on the next day,
  // then we extract its timezone components and get its exact midnight.
  const nextDayTime = new Date(startOfDay.getTime() + 25 * 60 * 60 * 1000);
  const nextParts = formatter.formatToParts(nextDayTime);
  const getNextVal = (name: string) => nextParts.find(p => p.type === name)!.value;
  
  const nextYear = parseInt(getNextVal("year"));
  const nextMonth = parseInt(getNextVal("month"));
  const nextDay = parseInt(getNextVal("day"));
  
  const nextDateStr = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
  const resetAt = getLocalMidnightInUtc(nextDateStr, tz);

  return { startOfDay, resetAt };
}
