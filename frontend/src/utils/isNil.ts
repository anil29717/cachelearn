/** Strict null/undefined check (avoids loose `== null` for static analysis). */
export function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}
