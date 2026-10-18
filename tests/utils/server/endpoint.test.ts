import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  Endpoint,
  EndpointDefinition,
} from "../../../src/utils/server/endpoint.js";

function createRequest(
  path = "https://example.com/api/test",
  init?: RequestInit,
): Request {
  return new Request(path, init);
}

describe("EndpointDefinition", () => {
  describe("configuration", () => {
    it("normalizes the endpoint path", () => {
      const endpoint = new EndpointDefinition({
        path: "//users//",
        method: "GET",
        handler: () => ({ success: true }),
      });

      expect(endpoint.path).toBe("/users");
      expect(endpoint.method).toBe("GET");
    });

    it("freezes the configuration and middleware array", () => {
      const middleware = vi.fn();
      const endpoint = new EndpointDefinition({
        path: "/users",
        method: "GET",
        middleware: [middleware],
        handler: () => null,
      });

      expect(Object.isFrozen(endpoint.config)).toBe(true);
      expect(Object.isFrozen(endpoint.config.middleware)).toBe(true);
    });

    it("copies the middleware array instead of retaining the original", () => {
      const middleware = vi.fn();
      const middlewareList = [middleware];

      const endpoint = new EndpointDefinition({
        path: "/users",
        method: "GET",
        middleware: middlewareList,
        handler: () => null,
      });

      middlewareList.push(vi.fn());

      expect(endpoint.config.middleware).toHaveLength(1);
    });

    it("creates an empty context when no context factory is configured", async () => {
      const handler = vi.fn(({ context }) => context);

      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        handler,
      });

      const result = await endpoint.handle(createRequest());

      expect(result).toEqual({});
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe("context", () => {
    it("resolves synchronous request context", async () => {
      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        context: ({ request }) => ({
          requestUrl: request.url,
          userId: "user_123",
        }),
        handler: ({ context }) => context,
      });

      await expect(endpoint.handle(createRequest())).resolves.toEqual({
        requestUrl: "https://example.com/api/test",
        userId: "user_123",
      });
    });

    it("resolves asynchronous request context", async () => {
      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        context: async () => ({
          userId: "user_123",
        }),
        handler: ({ context }) => context.userId,
      });

      await expect(endpoint.handle(createRequest())).resolves.toBe("user_123");
    });

    it("does not execute middleware or handler when context creation fails", async () => {
      const middleware = vi.fn();
      const handler = vi.fn();

      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        context: () => {
          throw new Error("Context initialization failed");
        },
        middleware: [middleware],
        handler,
      });

      await expect(endpoint.handle(createRequest())).rejects.toThrow(
        "Context initialization failed",
      );

      expect(middleware).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("middleware", () => {
    it("executes middleware sequentially in configured order", async () => {
      const order: string[] = [];

      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        middleware: [
          async () => {
            await Promise.resolve();
            order.push("first");
          },
          () => {
            order.push("second");
          },
          () => {
            order.push("third");
          },
        ],
        handler: () => {
          order.push("handler");
          return "done";
        },
      });

      await endpoint.handle(createRequest());

      expect(order).toEqual(["first", "second", "third", "handler"]);
    });

    it("provides the request, context, and response helpers", async () => {
      const request = createRequest();
      const middleware = vi.fn();
      let receivedRequest: Request | undefined;
      let receivedContext: object | undefined;
      let receivedResponse: unknown;

      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        context: () => ({ userId: "user_123" }),
        middleware: [
          (args) => {
            middleware(args);
            receivedRequest = args.request;
            receivedContext = args.context;
            receivedResponse = args.response;
          },
        ],
        handler: () => "done",
      });

      await endpoint.handle(request);

      expect(receivedRequest).toBe(request);
      expect(receivedContext).toEqual({ userId: "user_123" });
      expect(receivedResponse).toBeDefined();
      expect(middleware).toHaveBeenCalledOnce();
    });

    it("stops execution when middleware throws", async () => {
      const laterMiddleware = vi.fn();
      const handler = vi.fn();

      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        middleware: [
          () => {
            throw new Error("Access denied");
          },
          laterMiddleware,
        ],
        handler,
      });

      await expect(endpoint.handle(createRequest())).rejects.toThrow(
        "Access denied",
      );

      expect(laterMiddleware).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    it("stops execution when asynchronous middleware rejects", async () => {
      const handler = vi.fn();

      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        middleware: [
          async () => {
            throw new Error("Middleware rejected");
          },
        ],
        handler,
      });

      await expect(endpoint.handle(createRequest())).rejects.toThrow(
        "Middleware rejected",
      );

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("query validation", () => {
    it("parses and validates query parameters", async () => {
      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        input: {
          querySchema: z.object({
            page: z.coerce.number().int().positive(),
            search: z.string().optional(),
          }),
        },
        handler: ({ query }) => query,
      });

      await expect(
        endpoint.handle(
          createRequest("https://example.com/api/test?page=2&search=vitest"),
        ),
      ).resolves.toEqual({
        page: 2,
        search: "vitest",
      });
    });

    it("preserves repeated query parameters as arrays", async () => {
      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        input: {
          querySchema: z.object({
            tag: z.array(z.string()),
          }),
        },
        handler: ({ query }) => query,
      });

      await expect(
        endpoint.handle(
          createRequest(
            "https://example.com/api/test?tag=typescript&tag=vitest",
          ),
        ),
      ).resolves.toEqual({
        tag: ["typescript", "vitest"],
      });
    });

    it("rejects invalid query input", async () => {
      const handler = vi.fn();

      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        input: {
          querySchema: z.object({
            page: z.coerce.number().int().positive(),
          }),
        },
        handler,
      });

      await expect(
        endpoint.handle(
          createRequest("https://example.com/api/test?page=invalid"),
        ),
      ).rejects.toThrow();

      expect(handler).not.toHaveBeenCalled();
    });

    it("supports Zod transformations", async () => {
      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        input: {
          querySchema: z.object({
            name: z.string().trim().toLowerCase(),
          }),
        },
        handler: ({ query }) => query,
      });

      await expect(
        endpoint.handle(
          createRequest("https://example.com/api/test?name=%20VITEST%20"),
        ),
      ).resolves.toEqual({ name: "vitest" });
    });

    it("does not parse query parameters when no query schema is configured", async () => {
      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        handler: ({ query }) => query,
      });

      await expect(
        endpoint.handle(
          createRequest("https://example.com/api/test?unexpected=value"),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe("JSON body validation", () => {
    it("parses and validates a JSON body", async () => {
      const endpoint = new EndpointDefinition({
        path: "/users",
        method: "POST",
        input: {
          dataSchema: z.object({
            name: z.string().min(1),
            age: z.coerce.number().int().nonnegative(),
          }),
        },
        handler: ({ data }) => data,
      });

      await expect(
        endpoint.handle(
          createRequest("https://example.com/api/users", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              name: "Tolha",
              age: "20",
            }),
          }),
        ),
      ).resolves.toEqual({
        name: "Tolha",
        age: 20,
      });
    });

    it("accepts structured JSON media types", async () => {
      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "POST",
        input: {
          dataSchema: z.object({
            ok: z.boolean(),
          }),
        },
        handler: ({ data }) => data,
      });

      await expect(
        endpoint.handle(
          createRequest("https://example.com/api/test", {
            method: "POST",
            headers: {
              "content-type": "application/problem+json; charset=utf-8",
            },
            body: JSON.stringify({ ok: true }),
          }),
        ),
      ).resolves.toEqual({ ok: true });
    });

    it("rejects a missing content type", async () => {
      const handler = vi.fn();

      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "POST",
        input: {
          dataSchema: z.object({ name: z.string() }),
        },
        handler,
      });

      await expect(
        endpoint.handle(
          createRequest("https://example.com/api/test", {
            method: "POST",
            body: JSON.stringify({ name: "Tolha" }),
          }),
        ),
      ).rejects.toThrow();

      expect(handler).not.toHaveBeenCalled();
    });

    it("rejects a non-JSON content type", async () => {
      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "POST",
        input: {
          dataSchema: z.object({ name: z.string() }),
        },
        handler: () => "done",
      });

      await expect(
        endpoint.handle(
          createRequest("https://example.com/api/test", {
            method: "POST",
            headers: {
              "content-type": "text/plain",
            },
            body: "hello",
          }),
        ),
      ).rejects.toThrow();
    });

    it("rejects malformed JSON", async () => {
      const handler = vi.fn();

      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "POST",
        input: {
          dataSchema: z.object({ name: z.string() }),
        },
        handler,
      });

      await expect(
        endpoint.handle(
          createRequest("https://example.com/api/test", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: "{invalid-json",
          }),
        ),
      ).rejects.toThrow();

      expect(handler).not.toHaveBeenCalled();
    });

    it("rejects invalid JSON body data", async () => {
      const handler = vi.fn();

      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "POST",
        input: {
          dataSchema: z.object({
            name: z.string().min(1),
          }),
        },
        handler,
      });

      await expect(
        endpoint.handle(
          createRequest("https://example.com/api/test", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({ name: "" }),
          }),
        ),
      ).rejects.toThrow();

      expect(handler).not.toHaveBeenCalled();
    });

    it("does not consume the body when no body schema is configured", async () => {
      const request = createRequest("https://example.com/api/test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Tolha" }),
      });

      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "POST",
        handler: () => "done",
      });

      await expect(endpoint.handle(request)).resolves.toBe("done");
      expect(request.bodyUsed).toBe(false);
    });
  });

  describe("handler", () => {
    it("returns the handler result", async () => {
      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        handler: () => ({ success: true }),
      });

      await expect(endpoint.handle(createRequest())).resolves.toEqual({
        success: true,
      });
    });

    it("awaits asynchronous handler results", async () => {
      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        handler: async () => {
          await Promise.resolve();
          return "completed";
        },
      });

      await expect(endpoint.handle(createRequest())).resolves.toBe("completed");
    });

    it("propagates handler errors", async () => {
      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        handler: () => {
          throw new Error("Handler failed");
        },
      });

      await expect(endpoint.handle(createRequest())).rejects.toThrow(
        "Handler failed",
      );
    });

    it("passes the same request instance to the handler", async () => {
      const request = createRequest();

      const endpoint = new EndpointDefinition({
        path: "/test",
        method: "GET",
        handler: ({ request: receivedRequest }) => receivedRequest === request,
      });

      await expect(endpoint.handle(request)).resolves.toBe(true);
    });
  });
});

describe("Endpoint factory", () => {
  describe("base path and route creation", () => {
    it("joins the base path and route path", async () => {
      const api = new Endpoint({ basePath: "/api/v1/" });

      const endpoint = api.create({
        path: "/users",
        method: "GET",
        handler: () => "users",
      });

      expect(endpoint.path).toBe("/api/v1/users");
      await expect(endpoint.handle(createRequest())).resolves.toBe("users");
    });

    it("normalizes repeated slashes", () => {
      const api = new Endpoint({ basePath: "//api///v1//" });

      const endpoint = api.create({
        path: "//users//",
        method: "GET",
        handler: () => null,
      });

      expect(api.basePath).toBe("/api/v1");
      expect(endpoint.path).toBe("/api/v1/users");
    });

    it("supports an empty base path", () => {
      const api = new Endpoint();

      expect(
        api.create({
          path: "users",
          method: "GET",
          handler: () => null,
        }).path,
      ).toBe("/users");
    });

    it("supports a root route", () => {
      const api = new Endpoint({ basePath: "/api/v1" });

      expect(
        api.create({
          path: "/",
          method: "GET",
          handler: () => null,
        }).path,
      ).toBe("/api/v1");
    });

    it("supports a root base path", () => {
      const api = new Endpoint({ basePath: "/" });

      expect(
        api.create({
          path: "/users",
          method: "GET",
          handler: () => null,
        }).path,
      ).toBe("/users");
    });
  });

  describe("context inheritance", () => {
    it("inherits the factory context when the route has no context", async () => {
      const api = new Endpoint({
        context: () => ({
          userId: "user_123",
          role: "admin",
        }),
      });

      const endpoint = api.create({
        path: "/profile",
        method: "GET",
        handler: ({ context }) => context,
      });

      await expect(endpoint.handle(createRequest())).resolves.toEqual({
        userId: "user_123",
        role: "admin",
      });
    });

    it("uses the route context instead of the factory context", async () => {
      const factoryContext = vi.fn(() => ({
        source: "factory",
      }));

      const routeContext = vi.fn(() => ({
        source: "route",
      }));

      const api = new Endpoint({
        context: factoryContext,
      });

      const endpoint = api.create({
        path: "/profile",
        method: "GET",
        context: routeContext,
        handler: ({ context }) => context.source,
      });

      await expect(endpoint.handle(createRequest())).resolves.toBe("route");

      expect(routeContext).toHaveBeenCalledOnce();
      expect(factoryContext).not.toHaveBeenCalled();
    });
  });

  describe("middleware inheritance", () => {
    it("executes factory middleware before route middleware", async () => {
      const order: string[] = [];

      const api = new Endpoint({
        middleware: [
          () => {
            order.push("factory-1");
          },
          () => {
            order.push("factory-2");
          },
        ],
      });

      const endpoint = api.create({
        path: "/test",
        method: "GET",
        middleware: [
          () => {
            order.push("route-1");
          },
          () => {
            order.push("route-2");
          },
        ],
        handler: () => {
          order.push("handler");
        },
      });

      await endpoint.handle(createRequest());

      expect(order).toEqual([
        "factory-1",
        "factory-2",
        "route-1",
        "route-2",
        "handler",
      ]);
    });

    it("overrides factory middleware when middlewareMode is override", async () => {
      const factoryMiddleware = vi.fn();
      const routeMiddleware = vi.fn();

      const api = new Endpoint({
        middleware: [factoryMiddleware],
      });

      const endpoint = api.create({
        path: "/test",
        method: "GET",
        middlewareMode: "override",
        middleware: [routeMiddleware],
        handler: () => "done",
      });

      await endpoint.handle(createRequest());

      expect(factoryMiddleware).not.toHaveBeenCalled();
      expect(routeMiddleware).toHaveBeenCalledOnce();
    });

    it("runs no middleware when override mode has no route middleware", async () => {
      const factoryMiddleware = vi.fn();
      const handler = vi.fn();

      const api = new Endpoint({
        middleware: [factoryMiddleware],
      });

      const endpoint = api.create({
        path: "/test",
        method: "GET",
        middlewareMode: "override",
        handler,
      });

      await endpoint.handle(createRequest());

      expect(factoryMiddleware).not.toHaveBeenCalled();
      expect(handler).toHaveBeenCalledOnce();
    });

    it("supports factory middleware without route middleware", async () => {
      const middleware = vi.fn();

      const api = new Endpoint({
        middleware: [middleware],
      });

      const endpoint = api.create({
        path: "/test",
        method: "GET",
        handler: () => "done",
      });

      await endpoint.handle(createRequest());

      expect(middleware).toHaveBeenCalledOnce();
    });
  });

  describe("configuration immutability", () => {
    it("freezes the factory configuration and middleware array", () => {
      const middleware = vi.fn();

      const api = new Endpoint({
        basePath: "/api",
        middleware: [middleware],
      });

      expect(Object.isFrozen(api.config)).toBe(true);
      expect(Object.isFrozen(api.config.middleware)).toBe(true);
    });

    it("copies factory middleware instead of retaining the original array", () => {
      const first = vi.fn();
      const second = vi.fn();
      const middleware = [first];

      const api = new Endpoint({ middleware });
      middleware.push(second);

      const endpoint = api.create({
        path: "/test",
        method: "GET",
        handler: () => null,
      });

      expect(endpoint.config.middleware).toHaveLength(1);
      expect(endpoint.config.middleware?.[0]).toBe(first);
    });
  });
});
