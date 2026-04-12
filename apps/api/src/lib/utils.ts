export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function startOfWeek(date = new Date()): string {
  const copy = new Date(date);
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

export function endOfWeek(date = new Date()): string {
  const copy = new Date(startOfWeek(date));
  copy.setUTCDate(copy.getUTCDate() + 6);
  return copy.toISOString().slice(0, 10);
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
