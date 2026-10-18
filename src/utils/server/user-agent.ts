import { getHeader } from "./header.js";

/**
 * Recognized browser names.
 */
export type UserAgentBrowserName =
  | "Chrome"
  | "Chromium"
  | "Edge"
  | "Firefox"
  | "Safari"
  | "Opera"
  | "Samsung Internet"
  | "Brave"
  | "Internet Explorer"
  | "DuckDuckGo"
  | "Vivaldi"
  | "Yandex"
  | "Other"
  | "Unknown";

/**
 * Recognized operating system names.
 */
export type UserAgentOSName =
  | "Windows"
  | "macOS"
  | "iOS"
  | "Android"
  | "Chrome OS"
  | "Linux"
  | "Ubuntu"
  | "Other"
  | "Unknown";

/**
 * Broad categorization of device types.
 */
export type UserAgentDeviceType =
  | "desktop"
  | "mobile"
  | "tablet"
  | "tv"
  | "console"
  | "wearable"
  | "embedded"
  | "unknown";

/**
 * Browser rendering engine names.
 */
export type UserAgentEngineName =
  | "Blink"
  | "WebKit"
  | "Gecko"
  | "Trident"
  | "EdgeHTML"
  | "Presto"
  | "Other"
  | "Unknown";

/**
 * CPU architecture classifications.
 */
export type UserAgentArchitecture =
  | "x86"
  | "x64"
  | "arm"
  | "arm64"
  | "ia64"
  | "unknown";

/**
 * Structured breakdown of parsed user agent metadata.
 */
export interface UserAgentInfo {
  /** The raw, trimmed User-Agent string from the request header, or null if missing. */
  readonly raw: string | null;
  /** Flag indicating whether the user agent matches known automated crawlers or bots. */
  readonly isBot: boolean;
  /** Flag indicating whether the request originated from a mobile device. */
  readonly isMobile: boolean;
  /** Flag indicating whether the request originated from a tablet device. */
  readonly isTablet: boolean;
  /** Flag indicating whether the request originated from a desktop device. */
  readonly isDesktop: boolean;
  /** Browser details. */
  readonly browser: {
    readonly name: UserAgentBrowserName;
    readonly version: string | null;
    readonly major: number | null;
  };
  /** Operating system details. */
  readonly os: {
    readonly name: UserAgentOSName;
    readonly version: string | null;
  };
  /** Hardware device details. */
  readonly device: {
    readonly type: UserAgentDeviceType;
    readonly vendor: string | null;
    readonly model: string | null;
  };
  /** Browser rendering engine details. */
  readonly engine: {
    readonly name: UserAgentEngineName;
    readonly version: string | null;
  };
  /** CPU architecture details. */
  readonly cpu: {
    readonly architecture: UserAgentArchitecture;
  };
}

/**
 * Internal representation of a parsed software version.
 */
interface ParsedVersion {
  readonly version: string | null;
  readonly major: number | null;
}

/**
 * Matches version numbers from a user agent string against a list of regular expressions.
 *
 * @param ua - The raw user agent string.
 * @param patterns - An array of regex patterns configured with a capture group for versioning.
 * @returns The matched full version string and parsed major version number.
 */
function matchVersion(ua: string, patterns: readonly RegExp[]): ParsedVersion {
  for (const pattern of patterns) {
    const match = pattern.exec(ua);
    const version = match?.[1];

    if (version) {
      const major = Number.parseInt(version.split(".")[0] ?? "", 10);

      return {
        version,
        major: Number.isFinite(major) ? major : null,
      };
    }
  }

  return { version: null, major: null };
}

/**
 * Detects if the given user agent string belongs to a search engine crawler or scraper bot.
 *
 * @param ua - The raw user agent string.
 * @returns True if a known bot signature is detected, false otherwise.
 */
function detectBot(ua: string): boolean {
  const botPattern =
    /\b(bot|crawler|spider|slurp|adsbot|googlebot|bingbot|yandexbot|baiduspider|duckduckbot|facebookexternalhit|twitterbot|linkedinbot|embedly|whatsapp|telegrambot|discordbot|skypeuripreview|pinterest|applebot|petalbot|semrushbot|ahrefsbot)\b/i;
  return botPattern.test(ua);
}

/**
 * Identifies the web browser and its version from the user agent string.
 *
 * @param ua - The raw user agent string.
 * @returns Browser name, version, and major number.
 */
function detectBrowser(ua: string): UserAgentInfo["browser"] {
  const browsers: readonly [UserAgentBrowserName, RegExp][] = [
    ["DuckDuckGo", /\bDuckDuckGo\/([\d.]+)/i],
    ["Samsung Internet", /\bSamsungBrowser\/([\d.]+)/i],
    ["Yandex", /\bYaBrowser\/([\d.]+)/i],
    ["Vivaldi", /\bVivaldi\/([\d.]+)/i],
    ["Opera", /\b(?:OPR|Opera)\/([\d.]+)/i],
    ["Edge", /\b(?:Edg|EdgA|EdgiOS)\/([\d.]+)/i],
    ["Brave", /\bBrave\/([\d.]+)/i],
    ["Internet Explorer", /\bMSIE\s([\d.]+)/i],
    ["Internet Explorer", /\bTrident\/.*?\brv:([\d.]+)/i],
    ["Firefox", /\bFirefox\/([\d.]+)/i],
    ["Chromium", /\bChromium\/([\d.]+)/i],
    ["Chrome", /\bChrome\/([\d.]+)/i],
    ["Safari", /\bVersion\/([\d.]+).*?\bSafari\//i],
  ];

  for (const [name, pattern] of browsers) {
    const result = matchVersion(ua, [pattern]);

    if (result.version) {
      return { name, ...result };
    }
  }

  return {
    name: ua ? "Other" : "Unknown",
    version: null,
    major: null,
  };
}

/**
 * Identifies the operating system and its version from the user agent string.
 *
 * @param ua - The raw user agent string.
 * @returns Operating system name and version.
 */
function detectOS(ua: string): UserAgentInfo["os"] {
  const patterns: readonly [UserAgentOSName, RegExp][] = [
    ["Windows", /\bWindows NT ([\d.]+)/i],
    ["iOS", /\b(?:iPhone|iPad|iPod).*?\bOS ([\d_]+)/i],
    ["Android", /\bAndroid(?:\s|\/)([\d.]+)/i],
    ["Chrome OS", /\bCrOS [^ ]+ ([\d.]+)/i],
    ["Ubuntu", /\bUbuntu(?:\/|\s)([\d.]+)?/i],
    ["macOS", /\bMac OS X ([\d_]+)/i],
    ["Linux", /\bLinux\b/i],
  ];

  for (const [name, pattern] of patterns) {
    const match = pattern.exec(ua);

    if (match) {
      const version = match[1]?.replaceAll("_", ".") ?? null;

      if (name === "Linux" && /\bAndroid\b/i.test(ua)) {
        continue;
      }

      if (name === "Ubuntu" || name === "Linux") {
        return { name, version };
      }

      if (name === "Windows") {
        const windowsVersions: Record<string, string> = {
          "10.0": "10/11",
          "6.3": "8.1",
          "6.2": "8",
          "6.1": "7",
          "6.0": "Vista",
          "5.1": "XP",
          "5.0": "2000",
        };

        return {
          name,
          version: version ? (windowsVersions[version] ?? version) : null,
        };
      }

      return { name, version };
    }
  }

  if (/\bMacintosh\b/i.test(ua)) {
    return { name: "macOS", version: null };
  }

  return {
    name: ua ? "Other" : "Unknown",
    version: null,
  };
}

/**
 * Detects device hardware characteristics, category type, vendor, and model.
 *
 * @param ua - The raw user agent string.
 * @returns Device type, vendor, and model name.
 */
function detectDevice(ua: string): UserAgentInfo["device"] {
  const android = /\bAndroid\b/i.test(ua);
  const ipad = /\biPad\b/i.test(ua);
  const iphone = /\biPhone\b|\biPod\b/i.test(ua);
  const tablet = /\bTablet\b|\bPlayBook\b|\bSilk\b/i.test(ua);
  const mobile = /\bMobile\b|\bMobi\b|\bIEMobile\b/i.test(ua);

  let type: UserAgentDeviceType = "desktop";

  if (/\bSmartTV\b|\bSmart-TV\b|\bHbbTV\b|\bGoogleTV\b|\bAppleTV\b/i.test(ua)) {
    type = "tv";
  } else if (/\bXbox\b|\bPlayStation\b|\bNintendo\b/i.test(ua)) {
    type = "console";
  } else if (/\bWatch\b|\bWear OS\b/i.test(ua)) {
    type = "wearable";
  } else if (ipad || tablet || (android && !mobile)) {
    type = "tablet";
  } else if (iphone || mobile) {
    type = "mobile";
  }

  let vendor: string | null = null;
  let model: string | null = null;

  if (iphone || ipad) {
    vendor = "Apple";
    model = ipad ? "iPad" : /\biPod\b/i.test(ua) ? "iPod" : "iPhone";
  } else if (/\bPixel(?:\s|\/)/i.test(ua)) {
    vendor = "Google";
    model =
      ua.match(/\b(Pixel[\w ]*?)(?:\s+Build\/|;|\))/i)?.[1]?.trim() ?? null;
  } else if (/\bSamsung\b|\bSM-[A-Z0-9]+/i.test(ua)) {
    vendor = "Samsung";
    model = ua.match(/\b(SM-[A-Z0-9]+)/i)?.[1] ?? null;
  }

  return { type, vendor, model };
}

/**
 * Identifies the browser rendering engine from the user agent string.
 *
 * @param ua - The raw user agent string.
 * @returns Rendering engine name and version.
 */
function detectEngine(ua: string): UserAgentInfo["engine"] {
  const patterns: readonly [UserAgentEngineName, RegExp][] = [
    ["EdgeHTML", /\bEdge\/([\d.]+)/i],
    ["Trident", /\bTrident\/([\d.]+)/i],
    ["Presto", /\bPresto\/([\d.]+)/i],
    ["Gecko", /\brv:([\d.]+).*?\bGecko\//i],
    ["Blink", /\bChrome\/([\d.]+)/i],
    ["WebKit", /\bAppleWebKit\/([\d.]+)/i],
  ];

  for (const [name, pattern] of patterns) {
    const match = pattern.exec(ua);

    if (match?.[1]) {
      return {
        name,
        version: match[1],
      };
    }
  }

  return {
    name: ua ? "Other" : "Unknown",
    version: null,
  };
}

/**
 * Determines the CPU architecture from the user agent header.
 *
 * @param ua - The raw user agent string.
 * @returns The identified CPU architecture classification.
 */
function detectArchitecture(ua: string): UserAgentArchitecture {
  if (/\b(?:arm64|aarch64)\b/i.test(ua)) return "arm64";
  if (/\b(?:arm|armv\d+\w*)\b/i.test(ua)) return "arm";
  if (/\b(?:x86_64|x64|Win64|WOW64|amd64)\b/i.test(ua)) return "x64";
  if (/\b(?:i[3-6]86|x86|Win32)\b/i.test(ua)) return "x86";
  if (/\bia64\b/i.test(ua)) return "ia64";

  return "unknown";
}

/**
 * Parses browser, operating system, device, rendering engine,
 * CPU architecture, and bot indicators from an HTTP request's User-Agent header.
 *
 * @param request - The incoming HTTP Request object.
 * @returns A structured `UserAgentInfo` object containing parsed client details.
 */
export function getUserAgent(request: Request): UserAgentInfo {
  const raw = getHeader(request, "User-Agent")?.trim() || null;

  if (!raw) {
    return {
      raw: null,
      isBot: false,
      isMobile: false,
      isTablet: false,
      isDesktop: false,
      browser: {
        name: "Unknown",
        version: null,
        major: null,
      },
      os: {
        name: "Unknown",
        version: null,
      },
      device: {
        type: "unknown",
        vendor: null,
        model: null,
      },
      engine: {
        name: "Unknown",
        version: null,
      },
      cpu: {
        architecture: "unknown",
      },
    };
  }

  const device = detectDevice(raw);
  const isBot = detectBot(raw);

  return {
    raw,
    isBot,
    isMobile: device.type === "mobile",
    isTablet: device.type === "tablet",
    isDesktop: device.type === "desktop",
    browser: detectBrowser(raw),
    os: detectOS(raw),
    device,
    engine: detectEngine(raw),
    cpu: {
      architecture: detectArchitecture(raw),
    },
  };
}
