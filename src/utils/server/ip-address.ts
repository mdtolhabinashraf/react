import { getHeader } from "./header.js";

/**
 * Sanitizes and validates an IP address.
 * @param ip - The IP address to sanitize and validate.
 * @returns The sanitized IP address if valid, otherwise null.
 */
export function sanitizeIp(ip: string | undefined): string | null {
  if (!ip) return null; // Default fallback if IP is undefined or empty

  // Advanced validation for IPv4
  const isValidIPv4 =
    /^(25[0-5]|2[0-4][0-9]|[0-1]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[0-1]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[0-1]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[0-1]?[0-9][0-9]?)$/.test(
      ip,
    );

  // Advanced validation for IPv6
  const isValidIPv6 =
    /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/.test(
      ip,
    );

  // Return the IP if it passes validation, otherwise return the fallback
  return isValidIPv4 || isValidIPv6 ? ip : null;
}

/**
 * Retrieves the client's IP address from a Request object.
 * @param request - The Request object from which to retrieve the client's IP address.
 * @returns The client's IP address as a string, or "0.0.0.0" if it cannot be determined.
 */
export function getClientIp(request: Request): string {
  // Extract IP from the "Forwarded" header
  const getForwardedIp = (): string | null => {
    const forwarded = getHeader(request, "Forwarded");
    if (forwarded) {
      const match = forwarded.match(/for=([^;]+)/);
      return match && match[1]
        ? sanitizeIp(match[1].replace(/"/g, "").trim())
        : null;
    }
    return null;
  };

  // Extract IP from various headers
  const getIpFromHeaders = (): string | null => {
    const headersToCheck = [
      "CF-Connecting-IP", // Cloudflare
      "X-Forwarded-For", // Proxies
      "X-Real-IP", // Nginx or similar
    ];

    for (const header of headersToCheck) {
      const value = getHeader(request, header);

      if (!value) continue;

      const ip =
        header === "X-Forwarded-For"
          ? value.split(",")[0]?.trim()
          : value.trim();

      const sanitizedIp = sanitizeIp(ip);

      // Continue to the next header if this value is invalid.
      if (sanitizedIp) {
        return sanitizedIp;
      }
    }

    return null;
  };

  // Extract IP from the socket (Node.js fallback)
  const getIpFromSocket = (): string | null => {
    interface ExtendedRequest extends Request {
      socket?: { remoteAddress?: string };
    }
    const socketIp = (request as ExtendedRequest).socket?.remoteAddress;
    return sanitizeIp(socketIp);
  };

  // Determine the client IP
  const ipAddress =
    getIpFromSocket() || // Fallback to socket
    getIpFromHeaders() || // Check headers
    getForwardedIp() || // Check "Forwarded" header
    "0.0.0.0"; // Default fallback IP

  return ipAddress;
}
