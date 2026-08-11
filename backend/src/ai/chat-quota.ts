export function aiDailyRequestLimit(telegramLinked: boolean): number {
  return telegramLinked ? 20 : 10;
}
