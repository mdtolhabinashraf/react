/**
 * UUID Utility Class
 * Provides methods for generating, validating, and extracting timestamps from UUIDs.
 * This class is designed to work with UUIDs that may include a timestamp and can be validated against an optional expiration time.
 */
export class UUID {
  /**
   * Generate a random UUID.
   * @param options Options for generating the UUID.
   * @param options.timestamp If true, includes a timestamp in the UUID.
   * @param options.uppercase If true, returns the UUID in uppercase.
   * @returns A random UUID string.
   */
  public static random(timestamp?: boolean, uppercase?: boolean): string {
    const uuid = crypto.randomUUID();
    if (timestamp) {
      const timestampHex = Math.floor(Date.now() / 1000).toString(16);
      const formattedUUID = uuid.slice(8);
      const token = (timestampHex + formattedUUID).replace(/-/g, "-");
      return uppercase ? token.toUpperCase() : token;
    }
    return uppercase ? uuid.toUpperCase() : uuid;
  }

  /**
   * Extract the timestamp from a UUID string.
   * @param uuid The UUID string to extract the timestamp from.
   * @returns A Date object representing the timestamp, or null if invalid.
   */
  public static getTime(uuid: string): Date | null {
    if (!uuid) return null;
    const hexMatch = uuid.match(/^[a-fA-F0-9]+/);
    if (!hexMatch) return null;
    const timestampHex = hexMatch[0].slice(0, 8);
    const timestampSeconds = parseInt(timestampHex, 16);
    if (isNaN(timestampSeconds)) return null;
    return new Date(timestampSeconds * 1000);
  }

  /**
   * Validate a UUID string.
   * @param uuid The UUID string to validate.
   * @param expires Optional expiration time in milliseconds or a Date object. If provided, the UUID will be considered invalid if it has expired.
   * @returns True if the UUID is valid, false otherwise.
   */
  public static validate(uuid: string, expires?: Date | number): boolean {
    if (!uuid) return false;
    const uuidRegex =
      /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;
    if (!uuidRegex.test(uuid)) return false;
    if (expires) {
      const timestamp = this.getTime(uuid);
      if (!timestamp) return false;
      if (expires) {
        if (typeof expires === "number") {
          const currentTime = Date.now();
          expires = new Date(currentTime + expires);
        }
        if (timestamp.getTime() > expires.getTime()) {
          return false;
        }
      }
    }
    return true;
  }
}
