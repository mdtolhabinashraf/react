import { describe, expect, it } from "vitest";
import {
  createResponseHelpers,
  type TypedResponse,
} from "../../../src/utils/internal/response-helpers.js";

describe("createResponseHelpers", () => {
  const response = createResponseHelpers();

  describe("json", () => {
    it("creates a JSON response", async () => {
      const body = { id: "123", name: "Tolha" };
      const result = response.json(body);

      expect(result).toBeInstanceOf(Response);
      expect(result.headers.get("Content-Type")).toBe(
        "application/json; charset=utf-8",
      );
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual(body);
    });

    it("preserves the inferred body type", () => {
      const result = response.json({
        success: true,
        data: { id: 1 },
      });

      const typed: TypedResponse<{
        success: boolean;
        data: { id: number };
      }> = result;

      expect(typed).toBe(result);
    });

    it("supports custom status and status text", async () => {
      const result = response.json(
        { error: "Not found" },
        { status: 404, statusText: "Not Found" },
      );

      expect(result.status).toBe(404);
      expect(result.statusText).toBe("Not Found");
      expect(await result.json()).toEqual({ error: "Not found" });
    });

    it("preserves custom headers", () => {
      const result = response.json(
        { success: true },
        {
          headers: {
            "X-Request-Id": "request-123",
          },
        },
      );

      expect(result.headers.get("X-Request-Id")).toBe("request-123");
    });

    it("does not override a custom content type", () => {
      const result = response.json(
        { success: true },
        {
          headers: {
            "Content-Type": "application/vnd.api+json",
          },
        },
      );

      expect(result.headers.get("Content-Type")).toBe(
        "application/vnd.api+json",
      );
    });

    it("supports empty objects and arrays", async () => {
      expect(await response.json({}).json()).toEqual({});
      expect(await response.json([]).json()).toEqual([]);
    });

    it("supports null JSON bodies", async () => {
      const result = response.json(null);

      expect(await result.json()).toBeNull();
    });
  });

  describe("text", () => {
    it("creates a plain-text response", async () => {
      const result = response.text("Hello, world!");

      expect(result).toBeInstanceOf(Response);
      expect(result.headers.get("Content-Type")).toBe(
        "text/plain; charset=utf-8",
      );
      expect(result.status).toBe(200);
      expect(await result.text()).toBe("Hello, world!");
    });

    it("supports custom status and headers", async () => {
      const result = response.text("Created", {
        status: 201,
        headers: { "X-Custom": "value" },
      });

      expect(result.status).toBe(201);
      expect(result.headers.get("X-Custom")).toBe("value");
      expect(await result.text()).toBe("Created");
    });

    it("does not override a custom content type", () => {
      const result = response.text("Hello", {
        headers: { "Content-Type": "application/custom" },
      });

      expect(result.headers.get("Content-Type")).toBe("application/custom");
    });
  });

  describe("html", () => {
    it("creates an HTML response", async () => {
      const html = "<h1>Hello, world!</h1>";
      const result = response.html(html);

      expect(result).toBeInstanceOf(Response);
      expect(result.headers.get("Content-Type")).toBe(
        "text/html; charset=utf-8",
      );
      expect(result.status).toBe(200);
      expect(await result.text()).toBe(html);
    });

    it("supports custom status and headers", () => {
      const result = response.html("<h1>Created</h1>", {
        status: 201,
        headers: { "X-Custom": "html" },
      });

      expect(result.status).toBe(201);
      expect(result.headers.get("X-Custom")).toBe("html");
    });

    it("does not override a custom content type", () => {
      const result = response.html("<p>Hello</p>", {
        headers: { "Content-Type": "application/xhtml+xml" },
      });

      expect(result.headers.get("Content-Type")).toBe("application/xhtml+xml");
    });
  });

  describe("redirect", () => {
    it.each([301, 302, 303, 307, 308] as const)(
      "creates a redirect with status %i",
      (status) => {
        const result = response.redirect("https://example.com", status);

        expect(result).toBeInstanceOf(Response);
        expect(result.status).toBe(status);
        expect(result.headers.get("Location")).toBe("https://example.com/");
      },
    );

    it("defaults to status 302", () => {
      const result = response.redirect("https://example.com");

      expect(result.status).toBe(302);
    });

    it("accepts a URL instance", () => {
      const url = new URL("https://example.com/path");
      const result = response.redirect(url);

      expect(result.status).toBe(302);
      expect(result.headers.get("Location")).toBe(url.href);
    });
  });

  describe("raw", () => {
    it("returns the exact same response instance", () => {
      const original = new Response("Original body", {
        status: 202,
        headers: { "X-Original": "true" },
      });

      const result = response.raw(original);

      expect(result).toBe(original);
      expect(result.status).toBe(202);
      expect(result.headers.get("X-Original")).toBe("true");
    });

    it("preserves an existing response body", async () => {
      const original = Response.json({ message: "Existing response" });

      const result = response.raw(original);

      expect(await result.json()).toEqual({
        message: "Existing response",
      });
    });
  });
});
