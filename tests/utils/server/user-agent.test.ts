import { describe, expect, it } from "vitest";
import {
  getUserAgent,
  type UserAgentBrowserName,
  type UserAgentOSName,
} from "../../../src/utils/server/user-agent.js";

function createRequest(userAgent?: string): Request {
  const headers = new Headers();

  if (userAgent !== undefined) {
    headers.set("User-Agent", userAgent);
  }

  return new Request("https://example.com", { headers });
}

describe("getUserAgent", () => {
  describe("missing and unknown user agents", () => {
    it("returns safe defaults when the header is missing", () => {
      expect(getUserAgent(createRequest())).toEqual({
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
      });
    });

    it("treats an empty header as missing", () => {
      expect(getUserAgent(createRequest("   ")).raw).toBeNull();
    });

    it("trims surrounding whitespace", () => {
      expect(getUserAgent(createRequest("  CustomAgent/1.0  ")).raw).toBe(
        "CustomAgent/1.0",
      );
    });

    it("handles an unrecognized user agent", () => {
      const result = getUserAgent(createRequest("CustomAgent/1.0"));

      expect(result.browser.name).toBe("Other");
      expect(result.browser.version).toBeNull();
      expect(result.os.name).toBe("Other");
      expect(result.engine.name).toBe("Other");
      expect(result.device.type).toBe("desktop");
      expect(result.cpu.architecture).toBe("unknown");
    });
  });

  describe("browser detection", () => {
    const cases: {
      readonly name: UserAgentBrowserName;
      readonly userAgent: string;
      readonly version: string;
      readonly major: number;
    }[] = [
      {
        name: "Chrome",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.110 Safari/537.36",
        version: "120.0.6099.110",
        major: 120,
      },
      {
        name: "Edge",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
        version: "120.0.0.0",
        major: 120,
      },
      {
        name: "Firefox",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
        version: "121.0",
        major: 121,
      },
      {
        name: "Safari",
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
        version: "17.2",
        major: 17,
      },
      {
        name: "Opera",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0",
        version: "106.0.0.0",
        major: 106,
      },
      {
        name: "Samsung Internet",
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
        version: "23.0",
        major: 23,
      },
      {
        name: "Chromium",
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/120.0.0.0 Safari/537.36",
        version: "120.0.0.0",
        major: 120,
      },
      {
        name: "DuckDuckGo",
        userAgent: "Mozilla/5.0 DuckDuckGo/5.200.0",
        version: "5.200.0",
        major: 5,
      },
      {
        name: "Vivaldi",
        userAgent:
          "Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36 Vivaldi/6.5.3206.39",
        version: "6.5.3206.39",
        major: 6,
      },
      {
        name: "Yandex",
        userAgent:
          "Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36 YaBrowser/24.1.0.0",
        version: "24.1.0.0",
        major: 24,
      },
      {
        name: "Internet Explorer",
        userAgent:
          "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)",
        version: "10.0",
        major: 10,
      },
    ];

    it.each(cases)(
      "detects $name and its version",
      ({ name, userAgent, version, major }) => {
        const result = getUserAgent(createRequest(userAgent));

        expect(result.browser.name).toBe(name);
        expect(result.browser.version).toBe(version);
        expect(result.browser.major).toBe(major);
      },
    );

    it("does not identify Edge as Chrome", () => {
      const result = getUserAgent(
        createRequest(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
        ),
      );

      expect(result.browser.name).toBe("Edge");
    });
  });

  describe("operating system detection", () => {
    const cases: {
      readonly name: UserAgentOSName;
      readonly userAgent: string;
      readonly version: string | null;
    }[] = [
      {
        name: "Windows",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        version: "10/11",
      },
      {
        name: "Windows",
        userAgent: "Mozilla/5.0 (Windows NT 6.1; WOW64)",
        version: "7",
      },
      {
        name: "macOS",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        version: "10.15.7",
      },
      {
        name: "iOS",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)",
        version: "17.4",
      },
      {
        name: "Android",
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
        version: "14",
      },
      {
        name: "Chrome OS",
        userAgent: "Mozilla/5.0 (X11; CrOS x86_64 15662.0.0)",
        version: "15662.0.0",
      },
      {
        name: "Linux",
        userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
        version: null,
      },
    ];

    it.each(cases)("detects $name", ({ name, userAgent, version }) => {
      const result = getUserAgent(createRequest(userAgent));

      expect(result.os.name).toBe(name);
      expect(result.os.version).toBe(version);
    });
  });

  describe("device detection", () => {
    it("detects a desktop device", () => {
      const result = getUserAgent(
        createRequest(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        ),
      );

      expect(result.device.type).toBe("desktop");
      expect(result.isDesktop).toBe(true);
      expect(result.isMobile).toBe(false);
      expect(result.isTablet).toBe(false);
    });

    it("detects an iPhone", () => {
      const result = getUserAgent(
        createRequest(
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
        ),
      );

      expect(result.device.type).toBe("mobile");
      expect(result.device.vendor).toBe("Apple");
      expect(result.device.model).toBe("iPhone");
      expect(result.isMobile).toBe(true);
      expect(result.isTablet).toBe(false);
      expect(result.isDesktop).toBe(false);
    });

    it("detects an iPad as a tablet", () => {
      const result = getUserAgent(
        createRequest(
          "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        ),
      );

      expect(result.device.type).toBe("tablet");
      expect(result.device.vendor).toBe("Apple");
      expect(result.device.model).toBe("iPad");
      expect(result.isTablet).toBe(true);
    });

    it("detects an Android phone", () => {
      const result = getUserAgent(
        createRequest(
          "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240105.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        ),
      );

      expect(result.device.type).toBe("mobile");
      expect(result.device.vendor).toBe("Google");
      expect(result.device.model).toBe("Pixel 8");
      expect(result.isMobile).toBe(true);
    });

    it("detects an Android tablet without the Mobile token", () => {
      const result = getUserAgent(
        createRequest(
          "Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        ),
      );

      expect(result.device.type).toBe("tablet");
      expect(result.device.vendor).toBe("Samsung");
      expect(result.device.model).toBe("SM-T870");
      expect(result.isTablet).toBe(true);
    });

    it("detects a smart TV", () => {
      const result = getUserAgent(
        createRequest("Mozilla/5.0 (SMART-TV; SmartTV)"),
      );

      expect(result.device.type).toBe("tv");
    });

    it("detects a game console", () => {
      const result = getUserAgent(createRequest("Mozilla/5.0 (PlayStation 5)"));

      expect(result.device.type).toBe("console");
    });

    it("detects a wearable device", () => {
      const result = getUserAgent(
        createRequest("Mozilla/5.0 (Linux; Android 13; Wear OS)"),
      );

      expect(result.device.type).toBe("wearable");
    });
  });

  describe("rendering engine detection", () => {
    it("detects Blink from a Chromium-based browser", () => {
      const result = getUserAgent(
        createRequest(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ),
      );

      expect(result.engine.name).toBe("Blink");
      expect(result.engine.version).toBe("120.0.0.0");
    });

    it("detects WebKit from Safari", () => {
      const result = getUserAgent(
        createRequest(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
        ),
      );

      expect(result.engine.name).toBe("WebKit");
      expect(result.engine.version).toBe("605.1.15");
    });

    it("detects Gecko from Firefox", () => {
      const result = getUserAgent(
        createRequest(
          "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
        ),
      );

      expect(result.engine.name).toBe("Gecko");
      expect(result.engine.version).toBe("121.0");
    });

    it("detects Trident from Internet Explorer", () => {
      const result = getUserAgent(
        createRequest(
          "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)",
        ),
      );

      expect(result.engine.name).toBe("Trident");
      expect(result.engine.version).toBe("6.0");
    });
  });

  describe("CPU architecture detection", () => {
    it.each([
      ["x86_64", "x64"],
      ["Win64; x64", "x64"],
      ["amd64", "x64"],
      ["i686", "x86"],
      ["Win32", "x86"],
      ["arm64", "arm64"],
      ["aarch64", "arm64"],
      ["armv7l", "arm"],
      ["ia64", "ia64"],
      ["unknown-platform", "unknown"],
    ] as const)("detects %s as %s", (platform, expectedArchitecture) => {
      const result = getUserAgent(createRequest(`Mozilla/5.0 (${platform})`));

      expect(result.cpu.architecture).toBe(expectedArchitecture);
    });
  });

  describe("bot detection", () => {
    it.each([
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "DuckDuckBot/1.0",
      "Twitterbot/1.0",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0)",
      "Mozilla/5.0 (compatible; SemrushBot/7.0)",
    ])("identifies known bot signatures: %s", (userAgent) => {
      expect(getUserAgent(createRequest(userAgent)).isBot).toBe(true);
    });

    it.each([
      "Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 Firefox/121.0",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)",
    ])("does not classify a typical browser as a bot: %s", (userAgent) => {
      expect(getUserAgent(createRequest(userAgent)).isBot).toBe(false);
    });

    it("does not mark a missing user agent as a bot", () => {
      expect(getUserAgent(createRequest()).isBot).toBe(false);
    });
  });

  describe("combined metadata", () => {
    it("returns consistent browser, OS, device, engine, and CPU details", () => {
      const result = getUserAgent(
        createRequest(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.110 Safari/537.36",
        ),
      );

      expect(result).toMatchObject({
        isBot: false,
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        browser: {
          name: "Chrome",
          version: "120.0.6099.110",
          major: 120,
        },
        os: {
          name: "Windows",
          version: "10/11",
        },
        device: {
          type: "desktop",
        },
        engine: {
          name: "Blink",
          version: "120.0.6099.110",
        },
        cpu: {
          architecture: "x64",
        },
      });
    });
  });
});
