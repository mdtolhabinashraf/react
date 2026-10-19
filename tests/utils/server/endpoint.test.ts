import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { HttpMethod } from "apexa";
import {
  Endpoint,
  EndpointRegistry,
  type EndpointMiddleware,
} from "../../../src/utils/server/endpoint.js";

describe("Endpoint", () => {
  describe("configuration", () => {
    it("normalizes the endpoint path", () => {
      const endpoint = new Endpoint({
        path: "//users///profile/",
        method: "GET",
        handler: () => "ok",
      });

      expect(endpoint.path).toBe("/users/profile");
      expect(endpoint.method).toBe("GET");
    });

    it("normalizes an empty path to root", () => {
      const endpoint = new Endpoint({
        path: "",
        method: "GET",
        handler: () => "ok",
      });

      expect(endpoint.path).toBe("/");
    });

    it("freezes the configuration and middleware array", () => {
      const middleware = [vi.fn()];
      const endpoint = new Endpoint({
        path: "/users",
        method: "GET",
        middleware,
        handler: () => "ok",
      });

      expect(Object.isFrozen(endpoint.config)).toBe(true);
      expect(Object.isFrozen(endpoint.config.middleware)).toBe(true);
      expect(endpoint.config.middleware).not.toBe(middleware);
    });

    it.each(["GET", "HEAD"] as const)(
      "rejects a data schema for %s at runtime",
      (method) => {
        expect(
          () =>
            new Endpoint({
              path: "/users",
              method,
              input: {
                dataSchema: z.object({ name: z.string() }),
              },
              handler: () => "ok",
            } as never),
        ).toThrow(`${method} endpoints cannot declare a dataSchema.`);
      },
    );
  });

  describe("request handling", () => {
    it("invokes the handler and returns its result", async () => {
      const handler = vi.fn(() => ({ success: true }));

      const endpoint = new Endpoint({
        path: "/health",
        method: "GET",
        handler,
      });

      const result = await endpoint.handle(
        new Request("http://localhost/health"),
      );

      expect(result).toEqual({ success: true });
      expect(handler).toHaveBeenCalledOnce();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.any(Request),
          query: undefined,
          data: undefined,
          context: {},
          response: expect.any(Object),
        }),
      );
    });

    it("validates and passes parsed query parameters", async () => {
      const endpoint = new Endpoint({
        path: "/users",
        method: "GET",
        input: {
          querySchema: z.object({
            username: z.string(),
            page: z.coerce.number().int(),
          }),
        },
        handler: ({ query }) => query,
      });

      const result = await endpoint.handle(
        new Request("http://localhost/users?username=tolha&page=2"),
      );

      expect(result).toEqual({
        username: "tolha",
        page: 2,
      });
    });

    it("preserves repeated query parameters as arrays", async () => {
      const endpoint = new Endpoint({
        path: "/search",
        method: "GET",
        input: {
          querySchema: z.object({
            tag: z.array(z.string()),
          }),
        },
        handler: ({ query }) => query,
      });

      const result = await endpoint.handle(
        new Request("http://localhost/search?tag=typescript&tag=security"),
      );

      expect(result).toEqual({
        tag: ["typescript", "security"],
      });
    });

    it("rejects invalid query parameters", async () => {
      const endpoint = new Endpoint({
        path: "/users",
        method: "GET",
        input: {
          querySchema: z.object({
            page: z.coerce.number().int().positive(),
          }),
        },
        handler: vi.fn(),
      });

      await expect(
        endpoint.handle(new Request("http://localhost/users?page=-1")),
      ).rejects.toThrow();

      expect(endpoint.config.handler).not.toHaveBeenCalled();
    });

    it("parses and validates JSON request bodies", async () => {
      const endpoint = new Endpoint({
        path: "/users",
        method: "POST",
        input: {
          dataSchema: z.object({
            username: z.string(),
            age: z.number().int(),
          }),
        },
        handler: ({ data }) => data,
      });

      const result = await endpoint.handle(
        new Request("http://localhost/users", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            username: "tolha",
            age: 20,
          }),
        }),
      );

      expect(result).toEqual({
        username: "tolha",
        age: 20,
      });
    });

    it("rejects requests without a JSON content type", async () => {
      const endpoint = new Endpoint({
        path: "/users",
        method: "POST",
        input: {
          dataSchema: z.object({
            username: z.string(),
          }),
        },
        handler: vi.fn(),
      });

      await expect(
        endpoint.handle(
          new Request("http://localhost/users", {
            method: "POST",
            body: JSON.stringify({ username: "tolha" }),
          }),
        ),
      ).rejects.toThrow();

      expect(endpoint.config.handler).not.toHaveBeenCalled();
    });

    it("accepts structured JSON media types", async () => {
      const endpoint = new Endpoint({
        path: "/users",
        method: "POST",
        input: {
          dataSchema: z.object({
            username: z.string(),
          }),
        },
        handler: ({ data }) => data,
      });

      const result = await endpoint.handle(
        new Request("http://localhost/users", {
          method: "POST",
          headers: {
            "content-type": "application/problem+json; charset=utf-8",
          },
          body: JSON.stringify({ username: "tolha" }),
        }),
      );

      expect(result).toEqual({ username: "tolha" });
    });

    it("rejects malformed JSON", async () => {
      const endpoint = new Endpoint({
        path: "/users",
        method: "POST",
        input: {
          dataSchema: z.object({
            username: z.string(),
          }),
        },
        handler: vi.fn(),
      });

      await expect(
        endpoint.handle(
          new Request("http://localhost/users", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: "{invalid-json",
          }),
        ),
      ).rejects.toThrow();

      expect(endpoint.config.handler).not.toHaveBeenCalled();
    });

    it("rejects invalid JSON body data", async () => {
      const endpoint = new Endpoint({
        path: "/users",
        method: "POST",
        input: {
          dataSchema: z.object({
            username: z.string().min(3),
          }),
        },
        handler: vi.fn(),
      });

      await expect(
        endpoint.handle(
          new Request("http://localhost/users", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({ username: "ab" }),
          }),
        ),
      ).rejects.toThrow();

      expect(endpoint.config.handler).not.toHaveBeenCalled();
    });

    it("allows JSON bodies without a query schema", async () => {
      const endpoint = new Endpoint({
        path: "/users",
        method: "POST",
        input: {
          dataSchema: z.object({
            username: z.string(),
          }),
        },
        handler: ({ query, data }) => ({ query, data }),
      });

      const result = await endpoint.handle(
        new Request("http://localhost/users", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ username: "tolha" }),
        }),
      );

      expect(result).toEqual({
        query: undefined,
        data: { username: "tolha" },
      });
    });
  });

  describe("context", () => {
    it("creates context for each request", async () => {
      const contextFactory = vi.fn(({ request }: { request: Request }) => ({
        requestUrl: request.url,
      }));

      const endpoint = new Endpoint({
        path: "/context",
        method: "GET",
        context: contextFactory,
        handler: ({ context }) => context.requestUrl,
      });

      const first = await endpoint.handle(
        new Request("http://localhost/first"),
      );
      const second = await endpoint.handle(
        new Request("http://localhost/second"),
      );

      expect(first).toBe("http://localhost/first");
      expect(second).toBe("http://localhost/second");
      expect(contextFactory).toHaveBeenCalledTimes(2);
    });

    it("supports asynchronous context factories", async () => {
      const endpoint = new Endpoint({
        path: "/context",
        method: "GET",
        context: async () => ({
          userId: "user-1",
        }),
        handler: ({ context }) => context.userId,
      });

      await expect(
        endpoint.handle(new Request("http://localhost/context")),
      ).resolves.toBe("user-1");
    });

    it("propagates context factory errors", async () => {
      const endpoint = new Endpoint({
        path: "/context",
        method: "GET",
        context: () => {
          throw new Error("Context failed");
        },
        handler: vi.fn(),
      });

      await expect(
        endpoint.handle(new Request("http://localhost/context")),
      ).rejects.toThrow("Context failed");
    });
  });

  describe("middleware", () => {
    it("executes middleware sequentially before the handler", async () => {
      const events: string[] = [];

      const endpoint = new Endpoint({
        path: "/middleware",
        method: "GET",
        middleware: [
          async () => {
            events.push("middleware-1");
          },
          async () => {
            await Promise.resolve();
            events.push("middleware-2");
          },
        ],
        handler: () => {
          events.push("handler");
          return "ok";
        },
      });

      await endpoint.handle(new Request("http://localhost/middleware"));

      expect(events).toEqual(["middleware-1", "middleware-2", "handler"]);
    });

    it("passes request, context, and response helpers to middleware", async () => {
      const middleware = vi.fn();
      const context = { userId: "user-1" };

      const endpoint = new Endpoint({
        path: "/middleware",
        method: "GET",
        context: () => context,
        middleware: [middleware],
        handler: () => "ok",
      });

      await endpoint.handle(new Request("http://localhost/middleware"));

      expect(middleware).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.any(Request),
          context,
          response: expect.any(Object),
        }),
      );
    });

    it("stops execution when middleware throws", async () => {
      const secondMiddleware = vi.fn();
      const handler = vi.fn();

      const endpoint = new Endpoint({
        path: "/middleware",
        method: "GET",
        middleware: [
          () => {
            throw new Error("Forbidden");
          },
          secondMiddleware,
        ],
        handler,
      });

      await expect(
        endpoint.handle(new Request("http://localhost/middleware")),
      ).rejects.toThrow("Forbidden");

      expect(secondMiddleware).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    it("does not validate inputs after middleware fails", async () => {
      const endpoint = new Endpoint({
        path: "/middleware",
        method: "POST",
        middleware: [
          () => {
            throw new Error("Middleware failed");
          },
        ],
        input: {
          dataSchema: z.object({
            name: z.string(),
          }),
        },
        handler: vi.fn(),
      });

      await expect(
        endpoint.handle(
          new Request("http://localhost/middleware", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: "invalid",
          }),
        ),
      ).rejects.toThrow("Middleware failed");

      expect(endpoint.config.handler).not.toHaveBeenCalled();
    });
  });

  describe("handler errors", () => {
    it("propagates handler errors", async () => {
      const endpoint = new Endpoint({
        path: "/error",
        method: "GET",
        handler: () => {
          throw new Error("Handler failed");
        },
      });

      await expect(
        endpoint.handle(new Request("http://localhost/error")),
      ).rejects.toThrow("Handler failed");
    });

    it("supports asynchronous handler results", async () => {
      const endpoint = new Endpoint({
        path: "/async",
        method: "GET",
        handler: async () => {
          await Promise.resolve();
          return { success: true };
        },
      });

      await expect(
        endpoint.handle(new Request("http://localhost/async")),
      ).resolves.toEqual({ success: true });
    });
  });
});

describe("EndpointRegistry", () => {
  describe("configuration", () => {
    it("normalizes the registry base path", () => {
      const registry = new EndpointRegistry({
        basePath: "//api///v1/",
      });

      expect(registry.basePath).toBe("/api/v1");
    });

    it("uses root as the default base path", () => {
      const registry = new EndpointRegistry();

      expect(registry.basePath).toBe("/");
    });

    it("freezes the configuration and middleware array", () => {
      const middleware = [vi.fn()];

      const registry = new EndpointRegistry({
        basePath: "/api",
        middleware,
      });

      expect(Object.isFrozen(registry.config)).toBe(true);
      expect(Object.isFrozen(registry.config.middleware)).toBe(true);
      expect(registry.config.middleware).not.toBe(middleware);
    });
  });

  describe("route creation", () => {
    it("joins the base path and route path", () => {
      const registry = new EndpointRegistry({
        basePath: "/api/v1/",
      });

      const endpoint = registry.create({
        path: "/users",
        method: "GET",
        handler: () => "ok",
      });

      expect(endpoint.path).toBe("/api/v1/users");
    });

    it("normalizes redundant route slashes", () => {
      const registry = new EndpointRegistry({
        basePath: "//api//",
      });

      const endpoint = registry.create({
        path: "//users///profile/",
        method: "GET",
        handler: () => "ok",
      });

      expect(endpoint.path).toBe("/api/users/profile");
    });

    it("supports a root route", () => {
      const registry = new EndpointRegistry({
        basePath: "/api/v1",
      });

      const endpoint = registry.create({
        path: "/",
        method: "GET",
        handler: () => "ok",
      });

      expect(endpoint.path).toBe("/api/v1");
    });

    it("supports an empty base path", () => {
      const registry = new EndpointRegistry({
        basePath: "",
      });

      const endpoint = registry.create({
        path: "users",
        method: "GET",
        handler: () => "ok",
      });

      expect(endpoint.path).toBe("/users");
    });

    it("preserves the endpoint method", () => {
      const registry = new EndpointRegistry();

      const endpoint = registry.create({
        path: "/users",
        method: "PATCH",
        handler: () => "ok",
      });

      expect(endpoint.method).toBe("PATCH");
    });

    it.each([
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ] as const)("supports HTTP method %s", (method) => {
      const registry = new EndpointRegistry();

      const endpoint = registry.create({
        path: "/resource",
        method: method as HttpMethod,
        handler: () => method,
      });

      expect(endpoint.method).toBe(method);
    });
  });

  describe("context inheritance", () => {
    it("inherits the registry context factory", async () => {
      const registry = new EndpointRegistry({
        basePath: "/api",
        context: () => ({
          userId: "user-1",
        }),
      });

      const endpoint = registry.create({
        path: "/profile",
        method: "GET",
        handler: ({ context }) => context.userId,
      });

      await expect(
        endpoint.handle(new Request("http://localhost/api/profile")),
      ).resolves.toBe("user-1");
    });

    it("allows a route to override the registry context", async () => {
      const registry = new EndpointRegistry({
        context: () => ({
          source: "registry",
        }),
      });

      const endpoint = registry.create({
        path: "/profile",
        method: "GET",
        context: () => ({
          source: "route",
        }),
        handler: ({ context }) => context.source,
      });

      await expect(
        endpoint.handle(new Request("http://localhost/profile")),
      ).resolves.toBe("route");
    });

    it("uses an empty context when no factory is configured", async () => {
      const registry = new EndpointRegistry();

      const endpoint = registry.create({
        path: "/profile",
        method: "GET",
        handler: ({ context }) => context,
      });

      await expect(
        endpoint.handle(new Request("http://localhost/profile")),
      ).resolves.toEqual({});
    });
  });

  describe("middleware inheritance", () => {
    it("inherits registry middleware by default", async () => {
      const events: string[] = [];

      const registryMiddleware: EndpointMiddleware<object> = () => {
        events.push("registry");
      };

      const routeMiddleware: EndpointMiddleware<object> = () => {
        events.push("route");
      };

      const registry = new EndpointRegistry({
        middleware: [registryMiddleware],
      });

      const endpoint = registry.create({
        path: "/users",
        method: "GET",
        middleware: [routeMiddleware],
        handler: () => {
          events.push("handler");
          return "ok";
        },
      });

      await endpoint.handle(new Request("http://localhost/users"));

      expect(events).toEqual(["registry", "route", "handler"]);
    });

    it("supports registry middleware without route middleware", async () => {
      const middleware = vi.fn();

      const registry = new EndpointRegistry({
        middleware: [middleware],
      });

      const endpoint = registry.create({
        path: "/users",
        method: "GET",
        handler: () => "ok",
      });

      await endpoint.handle(new Request("http://localhost/users"));

      expect(middleware).toHaveBeenCalledOnce();
    });

    it("overrides registry middleware when requested", async () => {
      const events: string[] = [];

      const registryMiddleware: EndpointMiddleware<object> = () => {
        events.push("registry");
      };

      const routeMiddleware: EndpointMiddleware<object> = () => {
        events.push("route");
      };

      const registry = new EndpointRegistry({
        middleware: [registryMiddleware],
      });

      const endpoint = registry.create({
        path: "/users",
        method: "GET",
        middlewareMode: "override",
        middleware: [routeMiddleware],
        handler: () => "ok",
      });

      await endpoint.handle(new Request("http://localhost/users"));

      expect(events).toEqual(["route"]);
    });

    it("supports overriding registry middleware with an empty list", async () => {
      const middleware = vi.fn();

      const registry = new EndpointRegistry({
        middleware: [middleware],
      });

      const endpoint = registry.create({
        path: "/users",
        method: "GET",
        middlewareMode: "override",
        handler: () => "ok",
      });

      await endpoint.handle(new Request("http://localhost/users"));

      expect(middleware).not.toHaveBeenCalled();
    });

    it("does not mutate registry middleware when creating routes", () => {
      const registryMiddleware = vi.fn();
      const routeMiddleware = vi.fn();

      const registry = new EndpointRegistry({
        middleware: [registryMiddleware],
      });

      const first = registry.create({
        path: "/first",
        method: "GET",
        middleware: [routeMiddleware],
        handler: () => "ok",
      });

      const second = registry.create({
        path: "/second",
        method: "GET",
        handler: () => "ok",
      });

      expect(first.config.middleware).toHaveLength(2);
      expect(second.config.middleware).toHaveLength(1);
      expect(registry.config.middleware).toHaveLength(1);
    });
  });

  describe("input validation", () => {
    it("preserves schemas when creating an endpoint", async () => {
      const registry = new EndpointRegistry({
        basePath: "/api",
      });

      const endpoint = registry.create({
        path: "/users",
        method: "POST",
        input: {
          querySchema: z.object({
            source: z.string(),
          }),
          dataSchema: z.object({
            username: z.string(),
          }),
        },
        handler: ({ query, data }) => ({ query, data }),
      });

      const result = await endpoint.handle(
        new Request("http://localhost/api/users?source=web", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            username: "tolha",
          }),
        }),
      );

      expect(result).toEqual({
        query: { source: "web" },
        data: { username: "tolha" },
      });
    });

    it("rejects a data schema for GET routes at runtime", () => {
      const registry = new EndpointRegistry();

      expect(() =>
        registry.create({
          path: "/users",
          method: "GET",
          input: {
            dataSchema: z.object({
              username: z.string(),
            }),
          },
          handler: () => "ok",
        } as never),
      ).toThrow("GET endpoints cannot declare a dataSchema.");
    });
  });
});

describe("Endpoint type inference", () => {
  it("infers parsed query and body values from Zod schemas", async () => {
    const registry = new EndpointRegistry({
      basePath: "/api",
    });

    const endpoint = registry.create({
      path: "/users",
      method: "POST",
      input: {
        querySchema: z.object({
          page: z.coerce.number(),
        }),
        dataSchema: z.object({
          username: z.string(),
          active: z.boolean().default(true),
        }),
      },
      handler: ({ query, data }) => ({
        page: query.page,
        username: data.username,
        active: data.active,
      }),
    });

    const result = await endpoint.handle(
      new Request("http://localhost/api/users?page=2", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username: "tolha",
        }),
      }),
    );

    expect(result).toEqual({
      page: 2,
      username: "tolha",
      active: true,
    });
  });

  it("infers undefined query and data when schemas are omitted", () => {
    const endpoint = new Endpoint({
      path: "/health",
      method: "GET",
      handler: ({ query, data }) => {
        const queryIsUndefined: undefined = query;
        const dataIsUndefined: undefined = data;

        return {
          query: queryIsUndefined,
          data: dataIsUndefined,
        };
      },
    });

    expect(endpoint.path).toBe("/health");
  });

  it("preserves literal path and method types", () => {
    const registry = new EndpointRegistry({
      basePath: "/api",
    });

    const endpoint = registry.create({
      path: "/users",
      method: "GET",
      handler: () => "ok",
    });

    const path: "/api/users" = endpoint.path;
    const method: "GET" = endpoint.method;

    expect(path).toBe("/api/users");
    expect(method).toBe("GET");
  });

  it("supports explicit route context types", async () => {
    type UserContext = {
      user: {
        id: string;
      };
    };

    const registry = new EndpointRegistry({
      context: () => ({
        user: { id: "registry-user" },
      }),
    });

    const endpoint = registry.create<
      "/profile",
      "GET",
      undefined,
      undefined,
      string,
      UserContext
    >({
      path: "/profile",
      method: "GET",
      context: () => ({
        user: { id: "route-user" },
      }),
      handler: ({ context }) => context.user.id,
    });

    await expect(
      endpoint.handle(new Request("http://localhost/profile")),
    ).resolves.toBe("route-user");
  });
});
