import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import type { HttpMethod } from "apexa";

import {
  Endpoint,
  EndpointRegistry,
  normalizePath,
  type EndpointMiddleware,
  type JoinPaths,
} from "../../../src/utils/server/endpoint";

function createRequest(
  url = "http://localhost/api/test",
  init: RequestInit = {},
): Request {
  return new Request(url, init);
}

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

function jsonRequest(url: string, body: unknown, method = "POST"): Request {
  return createRequest(url, {
    method,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("normalizePath", () => {
  it.each([
    ["", "/"],
    ["/", "/"],
    ["///", "/"],
    ["api/users", "/api/users"],
    ["/api/users/", "/api/users"],
    ["//api///users///", "/api/users"],
    ["/api/a%2Fb", "/api/a%2Fb"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });
});

describe("Endpoint configuration", () => {
  it("normalizes the endpoint path", () => {
    const endpoint = new Endpoint({
      path: "///api//users///",
      method: "GET",
      handler: ({ response }) => response.json({ ok: true }),
    });

    expect(endpoint.path).toBe("/api/users");
    expect(endpoint.config.path).toBe("/api/users");
    expect(endpoint.method).toBe("GET");
  });

  it("normalizes an empty path to root", () => {
    const endpoint = new Endpoint({
      path: "",
      method: "GET",
      handler: ({ response }) => response.json({ ok: true }),
    });

    expect(endpoint.path).toBe("/");
  });

  it("freezes endpoint configuration", () => {
    const middleware: EndpointMiddleware[] = [() => undefined];

    const endpoint = new Endpoint({
      path: "/users",
      method: "GET",
      middleware,
      input: {
        querySchema: z.object({
          page: z.coerce.number(),
        }),
      },
      handler: ({ response }) => response.json({ ok: true }),
    });

    expect(Object.isFrozen(endpoint.config)).toBe(true);
    expect(Object.isFrozen(endpoint.config.middleware)).toBe(true);
    expect(Object.isFrozen(endpoint.config.input)).toBe(true);
    expect(endpoint.config.middleware).not.toBe(middleware);
  });

  it("rejects GET endpoints with body schemas at runtime", () => {
    expect(
      () =>
        new Endpoint({
          path: "/users",
          method: "GET",
          input: {
            dataSchema: z.object({ name: z.string() }),
          } as never,
          handler: ({ response }) => response.json({ ok: true }),
        }),
    ).toThrow("GET endpoints cannot declare a dataSchema.");
  });

  it("rejects HEAD endpoints with body schemas at runtime", () => {
    expect(
      () =>
        new Endpoint({
          path: "/users",
          method: "HEAD",
          input: {
            dataSchema: z.object({ name: z.string() }),
          } as never,
          handler: ({ response }) => response.raw(new Response(null)),
        }),
    ).toThrow("HEAD endpoints cannot declare a dataSchema.");
  });
});

describe("Endpoint response helper integration", () => {
  it("uses unknown for native and raw response bodies", () => {
    const nativeEndpoint = new Endpoint({
      path: "/native",
      method: "GET",
      handler: async () =>
        new Response("native", {
          headers: {
            "Content-Type": "text/plain",
          },
        }),
    });

    const rawEndpoint = new Endpoint({
      path: "/raw",
      method: "GET",
      handler: ({ response }) => response.raw(new Response("raw")),
    });

    const typedEndpoint = new Endpoint({
      path: "/typed",
      method: "GET",
      handler: ({ response }) => response.text("typed"),
    });

    expectTypeOf<typeof nativeEndpoint.$infer.result>().toEqualTypeOf<unknown>();
    expectTypeOf<typeof rawEndpoint.$infer.result>().toEqualTypeOf<unknown>();
    expectTypeOf<typeof typedEndpoint.$infer.result>().toEqualTypeOf<string>();
  });

  it("uses response.json() in the handler", async () => {
    const endpoint = new Endpoint({
      path: "/users",
      method: "GET",
      handler: ({ response }) =>
        response.json({
          id: "user-1",
          username: "tolha",
        }),
    });

    const result = await endpoint.handle(createRequest());

    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toContain("application/json");
    expect(await readJson(result)).toEqual({
      id: "user-1",
      username: "tolha",
    });
  });

  it("uses response.text() in the handler", async () => {
    const endpoint = new Endpoint({
      path: "/text",
      method: "GET",
      handler: ({ response }) => response.text("Hello"),
    });

    const result = await endpoint.handle(createRequest());

    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toContain("text/plain");
    expect(await result.text()).toBe("Hello");
  });

  it("uses response.html() in the handler", async () => {
    const endpoint = new Endpoint({
      path: "/html",
      method: "GET",
      handler: ({ response }) => response.html("<h1>Hello</h1>"),
    });

    const result = await endpoint.handle(createRequest());

    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toContain("text/html");
    expect(await result.text()).toBe("<h1>Hello</h1>");
  });

  it("uses response.redirect() in the handler", async () => {
    const endpoint = new Endpoint({
      path: "/redirect",
      method: "GET",
      handler: ({ response }) =>
        response.redirect("https://example.com/login", 307),
    });

    const result = await endpoint.handle(createRequest());

    expect(result.status).toBe(307);
    expect(result.headers.get("location")).toBe("https://example.com/login");
  });

  it("uses response.raw() in the handler", async () => {
    const original = new Response("native", {
      status: 202,
      headers: {
        "x-native": "true",
      },
    });

    const endpoint = new Endpoint({
      path: "/raw",
      method: "GET",
      handler: ({ response }) => response.raw(original),
    });

    const result = await endpoint.handle(createRequest());

    expect(result).toBe(original);
    expect(result.status).toBe(202);
    expect(result.headers.get("x-native")).toBe("true");
  });

  it("provides response helpers to middleware", async () => {
    const middleware = vi.fn(({ response }) => {
      expect(typeof response.json).toBe("function");
      expect(typeof response.text).toBe("function");
      expect(typeof response.html).toBe("function");
      expect(typeof response.redirect).toBe("function");
      expect(typeof response.raw).toBe("function");
    });

    const endpoint = new Endpoint({
      path: "/middleware",
      method: "GET",
      middleware: [middleware],
      handler: ({ response }) => response.json({ ok: true }),
    });

    const result = await endpoint.handle(createRequest());

    expect(result.status).toBe(200);
    expect(middleware).toHaveBeenCalledOnce();
  });

  it("shares response helpers between middleware and handler", async () => {
    let middlewareResponse: unknown;
    let handlerResponse: unknown;

    const endpoint = new Endpoint({
      path: "/same-response",
      method: "GET",
      middleware: [
        ({ response }) => {
          middlewareResponse = response;
        },
      ],
      handler: ({ response }) => {
        handlerResponse = response;
        return response.json({ ok: true });
      },
    });

    await endpoint.handle(createRequest());

    expect(handlerResponse).toBe(middlewareResponse);
  });

  it("creates independent helpers for separate requests", async () => {
    const instances: unknown[] = [];

    const endpoint = new Endpoint({
      path: "/separate",
      method: "GET",
      middleware: [
        ({ response }) => {
          instances.push(response);
        },
      ],
      handler: ({ response }) => response.json({ ok: true }),
    });

    await endpoint.handle(createRequest());
    await endpoint.handle(createRequest());

    expect(instances).toHaveLength(2);
    expect(instances[0]).not.toBe(instances[1]);
  });
});

describe("Endpoint response body inference", () => {
  it("infers the JSON body type from the response helper", () => {
    const endpoint = new Endpoint({
      path: "/users",
      method: "GET",
      handler: ({ response }) =>
        response.json({
          id: "user-1",
          username: "tolha",
        }),
    });

    type Result = typeof endpoint.$infer.result;

    const result: Result = {
      id: "user-1",
      username: "tolha",
    };

    expect(result).toEqual({
      id: "user-1",
      username: "tolha",
    });
  });

  it("infers string bodies from text responses", () => {
    const endpoint = new Endpoint({
      path: "/text",
      method: "GET",
      handler: ({ response }) => response.text("Hello"),
    });

    type Result = typeof endpoint.$infer.result;

    const result: Result = "Hello";

    expect(result).toBe("Hello");
  });

  it("infers string bodies from HTML responses", () => {
    const endpoint = new Endpoint({
      path: "/html",
      method: "GET",
      handler: ({ response }) => response.html("<h1>Hello</h1>"),
    });

    type Result = typeof endpoint.$infer.result;

    const result: Result = "<h1>Hello</h1>";

    expect(result).toBe("<h1>Hello</h1>");
  });

  it("falls back to Response when a native response is returned", () => {
    const endpoint = new Endpoint({
      path: "/native",
      method: "GET",
      handler: () => new Response("native"),
    });

    type Result = typeof endpoint.$infer.result;

    const result: Result = new Response("native");

    expect(result).toBeInstanceOf(Response);
  });

  it("falls back to Response for redirects", () => {
    const endpoint = new Endpoint({
      path: "/redirect",
      method: "GET",
      handler: ({ response }) => response.redirect("https://example.com"),
    });

    type Result = typeof endpoint.$infer.result;

    const result: Result = new Response(null);

    expect(result).toBeInstanceOf(Response);
  });

  it("infers the body type through an asynchronous handler", () => {
    const endpoint = new Endpoint({
      path: "/async",
      method: "GET",
      handler: async ({ response }) =>
        response.json({
          success: true,
          count: 3,
        }),
    });

    type Result = typeof endpoint.$infer.result;

    const result: Result = {
      success: true,
      count: 3,
    };

    expect(result).toEqual({
      success: true,
      count: 3,
    });
  });
});

describe("Endpoint request handling", () => {
  it("executes the handler and returns its response", async () => {
    const handler = vi.fn(({ response }) =>
      response.json({ message: "hello" }),
    );

    const endpoint = new Endpoint({
      path: "/hello",
      method: "GET",
      handler,
    });

    const result = await endpoint.handle(createRequest());

    expect(result.status).toBe(200);
    expect(await readJson(result)).toEqual({ message: "hello" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("supports asynchronous handlers", async () => {
    const endpoint = new Endpoint({
      path: "/async",
      method: "GET",
      handler: async ({ response }) => {
        await Promise.resolve();
        return response.json({ async: true });
      },
    });

    const result = await endpoint.handle(createRequest());

    expect(await readJson(result)).toEqual({ async: true });
  });

  it("passes the original Request to the handler", async () => {
    let received: Request | undefined;

    const endpoint = new Endpoint({
      path: "/request",
      method: "GET",
      handler: ({ request, response }) => {
        received = request;
        return response.json({ ok: true });
      },
    });

    const request = createRequest();

    await endpoint.handle(request);

    expect(received).toBe(request);
  });

  it("passes undefined query and data when schemas are absent", async () => {
    const endpoint = new Endpoint({
      path: "/empty",
      method: "POST",
      handler: ({ query, data, response }) => response.json({ query, data }),
    });

    const result = await endpoint.handle(createRequest());

    expect(await readJson(result)).toEqual({
      query: undefined,
      data: undefined,
    });
  });
});

describe("Endpoint context", () => {
  it("creates context for each request", async () => {
    let count = 0;

    const endpoint = new Endpoint({
      path: "/context",
      method: "GET",
      context: () => ({ requestId: ++count }),
      handler: ({ context, response }) => response.json(context),
    });

    const first = await endpoint.handle(createRequest());
    const second = await endpoint.handle(createRequest());

    expect(await readJson(first)).toEqual({ requestId: 1 });
    expect(await readJson(second)).toEqual({ requestId: 2 });
  });

  it("supports asynchronous context factories", async () => {
    const endpoint = new Endpoint({
      path: "/context",
      method: "GET",
      context: async () => {
        await Promise.resolve();
        return { userId: "user-1" };
      },
      handler: ({ context, response }) => response.json(context),
    });

    const result = await endpoint.handle(createRequest());

    expect(await readJson(result)).toEqual({ userId: "user-1" });
  });

  it("passes the request to the context factory", async () => {
    const factory = vi.fn(({ request }: { request: Request }) => ({
      url: request.url,
    }));

    const endpoint = new Endpoint({
      path: "/context",
      method: "GET",
      context: factory,
      handler: ({ context, response }) => response.json(context),
    });

    const request = createRequest();

    await endpoint.handle(request);

    expect(factory).toHaveBeenCalledWith({ request });
  });

  it("defaults to an empty context object", async () => {
    const endpoint = new Endpoint({
      path: "/context",
      method: "GET",
      handler: ({ context, response }) => response.json(context),
    });

    const result = await endpoint.handle(createRequest());

    expect(await readJson(result)).toEqual({});
  });

  it("stops execution if context creation throws", async () => {
    const middleware = vi.fn();
    const handler = vi.fn(({ response }) => response.json({ ok: true }));

    const endpoint = new Endpoint({
      path: "/context",
      method: "GET",
      context: () => {
        throw new Error("context failed");
      },
      middleware: [middleware],
      handler,
    });

    const result = await endpoint.handle(createRequest());

    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(middleware).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("Endpoint query validation", () => {
  it("parses query parameters with Zod", async () => {
    const endpoint = new Endpoint({
      path: "/users",
      method: "GET",
      input: {
        querySchema: z.object({
          page: z.coerce.number().int().positive(),
          search: z.string().optional(),
        }),
      },
      handler: ({ query, response }) => response.json(query),
    });

    const result = await endpoint.handle(
      createRequest("http://localhost/users?page=2&search=tolha"),
    );

    expect(await readJson(result)).toEqual({
      page: 2,
      search: "tolha",
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
      handler: ({ query, response }) => response.json(query),
    });

    const result = await endpoint.handle(
      createRequest("http://localhost/search?tag=a&tag=b"),
    );

    expect(await readJson(result)).toEqual({
      tag: ["a", "b"],
    });
  });

  it("rejects invalid query parameters", async () => {
    const handler = vi.fn(({ response }) => response.json({ ok: true }));

    const endpoint = new Endpoint({
      path: "/users",
      method: "GET",
      input: {
        querySchema: z.object({
          id: z.string().uuid(),
        }),
      },
      handler,
    });

    const result = await endpoint.handle(
      createRequest("http://localhost/users?id=invalid"),
    );

    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs middleware before query validation", async () => {
    const order: string[] = [];

    const endpoint = new Endpoint({
      path: "/users",
      method: "GET",
      middleware: [
        () => {
          order.push("middleware");
        },
      ],
      input: {
        querySchema: z.object({
          id: z.string().uuid(),
        }),
      },
      handler: ({ response }) => {
        order.push("handler");
        return response.json({ ok: true });
      },
    });

    await endpoint.handle(createRequest("http://localhost/users?id=invalid"));

    expect(order).toEqual(["middleware"]);
  });
});

describe("Endpoint body validation", () => {
  const dataSchema = z.object({
    username: z.string().min(3),
    password: z.string().min(8),
  });

  function createPostEndpoint() {
    return new Endpoint({
      path: "/signup",
      method: "POST",
      input: { dataSchema },
      handler: ({ data, response }) => response.json(data),
    });
  }

  it("parses a valid JSON body", async () => {
    const endpoint = createPostEndpoint();

    const result = await endpoint.handle(
      jsonRequest("http://localhost/signup", {
        username: "tolha",
        password: "secure-password",
      }),
    );

    expect(result.status).toBe(200);
    expect(await readJson(result)).toEqual({
      username: "tolha",
      password: "secure-password",
    });
  });

  it("accepts application/problem+json", async () => {
    const endpoint = createPostEndpoint();

    const result = await endpoint.handle(
      createRequest("http://localhost/signup", {
        method: "POST",
        headers: {
          "content-type": "application/problem+json",
        },
        body: JSON.stringify({
          username: "tolha",
          password: "secure-password",
        }),
      }),
    );

    expect(result.status).toBe(200);
  });

  it("accepts a JSON content type with charset", async () => {
    const endpoint = createPostEndpoint();

    const result = await endpoint.handle(
      createRequest("http://localhost/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          username: "tolha",
          password: "secure-password",
        }),
      }),
    );

    expect(result.status).toBe(200);
  });

  it("rejects a missing JSON content type", async () => {
    const handler = vi.fn(({ response }) => response.json({ ok: true }));

    const endpoint = new Endpoint({
      path: "/signup",
      method: "POST",
      input: { dataSchema },
      handler,
    });

    const result = await endpoint.handle(
      createRequest("http://localhost/signup", {
        method: "POST",
        body: JSON.stringify({
          username: "tolha",
          password: "secure-password",
        }),
      }),
    );

    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const handler = vi.fn(({ response }) => response.json({ ok: true }));

    const endpoint = new Endpoint({
      path: "/signup",
      method: "POST",
      input: { dataSchema },
      handler,
    });

    const result = await endpoint.handle(
      createRequest("http://localhost/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "{invalid-json",
      }),
    );

    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects invalid body data", async () => {
    const endpoint = createPostEndpoint();

    const result = await endpoint.handle(
      jsonRequest("http://localhost/signup", {
        username: "ab",
        password: "short",
      }),
    );

    expect(result.status).toBeGreaterThanOrEqual(400);
  });

  it("does not parse the body when no schema is configured", async () => {
    const endpoint = new Endpoint({
      path: "/webhook",
      method: "POST",
      handler: ({ response }) => response.json({ ok: true }),
    });

    const result = await endpoint.handle(
      createRequest("http://localhost/webhook", {
        method: "POST",
        body: "not JSON",
      }),
    );

    expect(result.status).toBe(200);
    expect(await readJson(result)).toEqual({ ok: true });
  });
});

describe("Endpoint middleware", () => {
  it("executes middleware sequentially", async () => {
    const order: number[] = [];

    const endpoint = new Endpoint({
      path: "/middleware",
      method: "GET",
      middleware: [
        () => {
          order.push(1);
        },
        async () => {
          await Promise.resolve();
          order.push(2);
        },
        () => {
          order.push(3);
        },
      ],
      handler: ({ response }) => {
        order.push(4);
        return response.json({ ok: true });
      },
    });

    const result = await endpoint.handle(createRequest());

    expect(result.status).toBe(200);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("stops when middleware throws", async () => {
    const second = vi.fn();
    const handler = vi.fn(({ response }) => response.json({ ok: true }));

    const endpoint = new Endpoint({
      path: "/middleware",
      method: "GET",
      middleware: [
        () => {
          throw new Error("blocked");
        },
        second,
      ],
      handler,
    });

    const result = await endpoint.handle(createRequest());

    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(second).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes request, context, and response helpers to middleware", async () => {
    const middleware = vi.fn(({ request, context, response }) => {
      expect(request).toBeInstanceOf(Request);
      expect(context).toEqual({ role: "admin" });
      expect(typeof response.json).toBe("function");
    });

    const endpoint = new Endpoint({
      path: "/middleware",
      method: "GET",
      context: () => ({ role: "admin" }),
      middleware: [middleware],
      handler: ({ response }) => response.json({ ok: true }),
    });

    await endpoint.handle(createRequest());

    expect(middleware).toHaveBeenCalledOnce();
  });
});

describe("Endpoint error handling", () => {
  it("converts synchronous handler errors to Responses", async () => {
    const endpoint = new Endpoint({
      path: "/error",
      method: "GET",
      handler: () => {
        throw new Error("internal failure");
      },
    });

    const result = await endpoint.handle(createRequest());

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBeGreaterThanOrEqual(400);
  });

  it("converts asynchronous handler errors to Responses", async () => {
    const endpoint = new Endpoint({
      path: "/error",
      method: "GET",
      handler: async () => {
        throw new Error("async failure");
      },
    });

    const result = await endpoint.handle(createRequest());

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBeGreaterThanOrEqual(400);
  });

  it("does not return the original Error object", async () => {
    const endpoint = new Endpoint({
      path: "/error",
      method: "GET",
      handler: () => {
        throw new Error("internal details");
      },
    });

    const result = await endpoint.handle(createRequest());

    expect(result).toBeInstanceOf(Response);
    expect(result).not.toBeInstanceOf(Error);
  });
});

describe("EndpointRegistry", () => {
  it("defaults the base path to root", () => {
    const registry = new EndpointRegistry();

    expect(registry.basePath).toBe("/");
    expect(registry.config.basePath).toBe("/");
  });

  it("normalizes the base path", () => {
    const registry = new EndpointRegistry({
      basePath: "///api//v1///",
    });

    expect(registry.basePath).toBe("/api/v1");
  });

  it("freezes registry configuration", () => {
    const registry = new EndpointRegistry({
      basePath: "/api",
      middleware: [() => undefined],
    });

    expect(Object.isFrozen(registry.config)).toBe(true);
    expect(Object.isFrozen(registry.config.middleware)).toBe(true);
  });

  it("joins the base path and route path", () => {
    const registry = new EndpointRegistry({
      basePath: "/api/v1",
    });

    const endpoint = registry.create({
      path: "/users",
      method: "GET",
      handler: ({ response }) => response.json({ ok: true }),
    });

    expect(endpoint.path).toBe("/api/v1/users");
  });

  it("normalizes repeated slashes when joining paths", () => {
    const registry = new EndpointRegistry({
      basePath: "///api//v1///",
    });

    const endpoint = registry.create({
      path: "///users//",
      method: "GET",
      handler: ({ response }) => response.json({ ok: true }),
    });

    expect(endpoint.path).toBe("/api/v1/users");
  });

  it("uses the base path for a root route", () => {
    const registry = new EndpointRegistry({
      basePath: "/api",
    });

    const endpoint = registry.create({
      path: "/",
      method: "GET",
      handler: ({ response }) => response.json({ ok: true }),
    });

    expect(endpoint.path).toBe("/api");
  });

  it("inherits registry context", async () => {
    const registry = new EndpointRegistry({
      context: () => ({ source: "registry" }),
    });

    const endpoint = registry.create({
      path: "/users",
      method: "GET",
      handler: ({ context, response }) => response.json(context),
    });

    const result = await endpoint.handle(createRequest());

    expect(await readJson(result)).toEqual({
      source: "registry",
    });
  });

  it("allows route context to override registry context", async () => {
    const registry = new EndpointRegistry({
      context: () => ({ source: "registry" }),
    });

    const endpoint = registry.create({
      path: "/users",
      method: "GET",
      context: () => ({ source: "route" }),
      handler: ({ context, response }) => response.json(context),
    });

    const result = await endpoint.handle(createRequest());

    expect(await readJson(result)).toEqual({
      source: "route",
    });
  });

  it("inherits registry middleware by default", async () => {
    const order: string[] = [];

    const registry = new EndpointRegistry({
      middleware: [
        () => {
          order.push("registry");
        },
      ],
    });

    const endpoint = registry.create({
      path: "/users",
      method: "GET",
      middleware: [
        () => {
          order.push("route");
        },
      ],
      handler: ({ response }) => {
        order.push("handler");
        return response.json({ ok: true });
      },
    });

    await endpoint.handle(createRequest());

    expect(order).toEqual(["registry", "route", "handler"]);
  });

  it("supports middleware override mode", async () => {
    const order: string[] = [];

    const registry = new EndpointRegistry({
      middleware: [
        () => {
          order.push("registry");
        },
      ],
    });

    const endpoint = registry.create({
      path: "/users",
      method: "GET",
      middlewareMode: "override",
      middleware: [
        () => {
          order.push("route");
        },
      ],
      handler: ({ response }) => {
        order.push("handler");
        return response.json({ ok: true });
      },
    });

    await endpoint.handle(createRequest());

    expect(order).toEqual(["route", "handler"]);
  });

  it("excludes registry middleware in override mode when route middleware is empty", async () => {
    const registryMiddleware = vi.fn();

    const registry = new EndpointRegistry({
      middleware: [registryMiddleware],
    });

    const endpoint = registry.create({
      path: "/users",
      method: "GET",
      middlewareMode: "override",
      handler: ({ response }) => response.json({ ok: true }),
    });

    await endpoint.handle(createRequest());

    expect(registryMiddleware).not.toHaveBeenCalled();
  });

  it("does not mutate the original registry middleware array", () => {
    const middleware: EndpointMiddleware[] = [() => undefined];

    const registry = new EndpointRegistry({ middleware });

    registry.create({
      path: "/users",
      method: "GET",
      middleware: [() => undefined],
      handler: ({ response }) => response.json({ ok: true }),
    });

    expect(registry.config.middleware).toHaveLength(1);
    expect(middleware).toHaveLength(1);
  });

  it("preserves literal paths for registry-created endpoints", () => {
    const registry = new EndpointRegistry({
      basePath: "/api/v1",
    });

    const endpoint = registry.create({
      path: "/users",
      method: "GET",
      handler: ({ response }) => response.json({ ok: true }),
    });

    const path: "/api/v1/users" = endpoint.path;

    expect(path).toBe("/api/v1/users");
  });

  it("supports typed response helpers on registry endpoints", async () => {
    const registry = new EndpointRegistry({
      basePath: "/api",
    });

    const endpoint = registry.create({
      path: "/users",
      method: "GET",
      handler: ({ response }) =>
        response.json({
          id: "user-1",
          username: "tolha",
        }),
    });

    const result = await endpoint.handle(createRequest());

    expect(result.status).toBe(200);
    expect(await readJson(result)).toEqual({
      id: "user-1",
      username: "tolha",
    });

    type Body = typeof endpoint.$infer.result;

    const body: Body = {
      id: "user-1",
      username: "tolha",
    };

    expect(body.username).toBe("tolha");
  });
});

describe("Endpoint type inference", () => {
  it("infers parsed query types from Zod", () => {
    new Endpoint({
      path: "/users",
      method: "GET",
      input: {
        querySchema: z.object({
          page: z.coerce.number(),
        }),
      },
      handler: ({ query, response }) => {
        const page: number = query.page;

        return response.json({ page });
      },
    });
  });

  it("infers parsed body types from Zod", () => {
    new Endpoint({
      path: "/users",
      method: "POST",
      input: {
        dataSchema: z.object({
          username: z.string(),
          age: z.coerce.number(),
        }),
      },
      handler: ({ data, response }) => {
        const username: string = data.username;
        const age: number = data.age;

        return response.json({ username, age });
      },
    });
  });

  it("infers undefined query and data when schemas are absent", () => {
    new Endpoint({
      path: "/users",
      method: "GET",
      handler: ({ query, data, response }) => {
        const queryValue: undefined = query;
        const dataValue: undefined = data;

        return response.json({
          query: queryValue,
          data: dataValue,
        });
      },
    });
  });

  it("infers the exact JSON body type", () => {
    const endpoint = new Endpoint({
      path: "/users",
      method: "GET",
      handler: ({ response }) =>
        response.json({
          id: "user-1",
          active: true,
        }),
    });

    type Body = typeof endpoint.$infer.result;

    const body: Body = {
      id: "user-1",
      active: true,
    };

    expect(body).toEqual({
      id: "user-1",
      active: true,
    });
  });

  it("supports route-specific context inference", () => {
    const registry = new EndpointRegistry({
      context: () => ({ requestId: "registry" }),
    });

    registry.create({
      path: "/users",
      method: "GET",
      context: () => ({
        user: {
          id: "user-1",
          role: "admin" as const,
        },
      }),
      handler: ({ context, response }) => {
        const id: string = context.user.id;
        const role: "admin" = context.user.role;

        return response.json({ id, role });
      },
    });
  });

  it("supports literal path joining", () => {
    type A = JoinPaths<"/api", "/users">;
    type B = JoinPaths<"", "/users">;
    type C = JoinPaths<"/api", "/">;

    const a: A = "/api/users";
    const b: B = "/users";
    const c: C = "/api";

    expect([a, b, c]).toEqual(["/api/users", "/users", "/api"]);
  });
});

describe("Endpoint HTTP methods", () => {
  const methods: HttpMethod[] = [
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ];

  it.each(methods)("supports the %s method", async (method) => {
    const endpoint = new Endpoint({
      path: "/method",
      method,
      handler: ({ response }) => response.json({ method }),
    });

    expect(endpoint.method).toBe(method);

    const result = await endpoint.handle(createRequest());

    expect(result.status).toBe(200);
    expect(await readJson(result)).toEqual({ method });
  });
});
