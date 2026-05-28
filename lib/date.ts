export function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function formatLongDate(value: string) {
  return parseIsoDate(value).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

export function listDates(startIso: string, endIso: string) {
  const dates: string[] = [];
  const current = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);

  while (current <= end) {
    dates.push(toIsoDate(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function monthLabel(iso: string) {
  return parseIsoDate(iso).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
}

export function weekdayIndex(iso: string) {
  return parseIsoDate(iso).getDay();
}
