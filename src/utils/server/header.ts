function isHeadersWithGet(
  h: unknown,
): h is { get: (name: string) => string | null } {
  return !!(h && typeof (h as { get?: unknown }).get === "function");
}

/**
 * Retrieves the value of a specified header from a Request object.
 * @param req - The Request object from which to retrieve the header.
 * @param name - The name of the header to retrieve.
 * @returns The value of the header as a string, or null if the header is not found.
 */
export function getHeader(req: Request, name: string): string | null {
  const headers = (req as { headers?: unknown }).headers;
  if (!headers) return null;

  // Fetch-like Headers with .get()
  if (isHeadersWithGet(headers)) {
    const v = headers.get(name);
    return v == null ? null : String(v);
  }

  // Node/NextApiRequest style headers object
  const obj = headers as Record<string, string | string[] | undefined>;
  const lower = name.toLowerCase();
  const value = obj[lower] ?? obj[name];
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value;
  if (value == null) return null;
  return String(value);
}
