export type TimeGranularity = 'hours' | 'minutes';

export const formatTimeRemaining = (
  targetIso: string,
  granularity: TimeGranularity,
  locale: 'RU' | 'EN'
) => {
  const end = Date.parse(targetIso);
  const now = Date.now();
  const diff = end - now;

  if (!Number.isFinite(diff) || diff <= 0) {
    return locale === 'RU' ? 'Завершено' : 'Ended';
  }

  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const dayLabel = locale === 'RU' ? 'д' : 'd';
  const hourLabel = locale === 'RU' ? 'ч' : 'h';
  const minuteLabel = locale === 'RU' ? 'м' : 'm';

  if (granularity === 'hours') {
    if (days > 0) {
      return `${days}${dayLabel} ${hours}${hourLabel}`;
    }
    return `${hours}${hourLabel}`;
  }

  if (days > 0 || hours > 0) {
    return `${days}${dayLabel} ${hours}${hourLabel} ${minutes}${minuteLabel}`;
  }

  return `${minutes}${minuteLabel}`;
};

