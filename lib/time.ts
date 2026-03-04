export type TimeGranularity = 'hours' | 'minutes';

export type TimeRemainingInfo = {
  totalMinutes: number;
  days: number;
  hours: number;
  minutes: number;
  isExpired: boolean;
  isUnderHour: boolean;
};

export const getTimeRemainingInfo = (targetIso: string): TimeRemainingInfo => {
  const end = Date.parse(targetIso);
  const now = Date.now();
  const diff = end - now;

  if (!Number.isFinite(diff) || diff <= 0) {
    return {
      totalMinutes: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      isExpired: true,
      isUnderHour: false,
    };
  }

  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  return {
    totalMinutes,
    days,
    hours,
    minutes,
    isExpired: false,
    isUnderHour: totalMinutes < 60,
  };
};

export const formatTimeRemaining = (
  targetIso: string,
  granularity: TimeGranularity,
  locale: 'RU' | 'EN'
) => {
  const remaining = getTimeRemainingInfo(targetIso);
  if (remaining.isExpired) {
    return locale === 'RU' ? 'Завершено' : 'Ended';
  }
  const { days, hours, minutes } = remaining;

  const dayLabel = locale === 'RU' ? 'д' : 'd';
  const hourLabel = locale === 'RU' ? 'ч' : 'h';
  const minuteLabel = locale === 'RU' ? 'м' : 'm';

  if (granularity === 'hours') {
    if (days > 0) {
      return `${days}${dayLabel} ${hours}${hourLabel}`;
    }
    if (hours > 0) {
      return `${hours}${hourLabel}`;
    }
    return `${minutes}${minuteLabel}`;
  }

  if (days > 0 || hours > 0) {
    return `${days}${dayLabel} ${hours}${hourLabel} ${minutes}${minuteLabel}`;
  }

  return `${minutes}${minuteLabel}`;
};
