/**
 * Type-safe endpoint definitions with Zod input validation, request-scoped
 * context, and composable middleware lifecycle hooks.
 *
 * @packageDocumentation
 */

import { z } from "zod";
import { createAppError } from "../app-error.js";
import {
  createResponseHelpers,
  type EndpointResponseHelpers,
} from "../internal/response-helpers.js";

const EndpointError = createAppError({
  name: "EndpointError",
});

/**
 * HTTP methods supported by endpoint definitions.
 */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "CONNECT"
  | "TRACE";

/**
 * A Zod schema accepted by an endpoint for input validation.
 */
type Schema = z.ZodType;

/**
 * Infers the parsed output of a Zod schema.
 *
 * Resolves to undefined when no schema is configured.
 */
type InferSchema<TSchema> = TSchema extends Schema
  ? z.output<TSchema>
  : undefined;

/**
 * An object containing request-scoped values.
 *
 * Context can hold trusted application data such as authenticated user
 * information, database connections, and request-specific services.
 */
export type EndpointContext = object;

/**
 * Creates request-scoped context for an endpoint.
 *
 * The returned context must be created from trusted server-side sources.
 * Do not treat client-provided headers or request data as authenticated
 * or otherwise trusted without verifying them.
 *
 * @typeParam TContext - The context returned by the factory.
 */
export type EndpointContextFactory<
  TContext extends EndpointContext = EndpointContext,
> = (args: { readonly request: Request }) => TContext | Promise<TContext>;

/**
 * Arguments supplied to endpoint middleware hooks.
 *
 * @typeParam TContext - The context available to the middleware.
 */
export type EndpointMiddlewareArgs<
  TContext extends EndpointContext = EndpointContext,
> = {
  readonly request: Request;
  readonly context: TContext;
  readonly response: EndpointResponseHelpers;
};

/**
 * A middleware hook executed before endpoint input validation.
 *
 * Middleware executes sequentially in configured order. Throwing an error
 * rejects endpoint execution and prevents subsequent middleware, validation,
 * and the handler from running.
 *
 * @typeParam TContext - The context available to the middleware.
 */
export type EndpointMiddleware<
  TContext extends EndpointContext = EndpointContext,
> = (args: EndpointMiddlewareArgs<TContext>) => void | Promise<void>;

/**
 * Arguments supplied to an endpoint handler.
 *
 * Query and body values contain the parsed output of their respective
 * Zod schemas. They are undefined when their schemas are not configured.
 *
 * @typeParam TQuery - Parsed query input.
 * @typeParam TData - Parsed body input.
 * @typeParam TContext - Request-scoped context.
 */
export type EndpointHandlerArgs<
  TQuery = undefined,
  TData = undefined,
  TContext extends EndpointContext = object,
> = {
  readonly request: Request;
  readonly query: TQuery;
  readonly data: TData;
  readonly context: TContext;
  readonly response: EndpointResponseHelpers;
};

/**
 * An endpoint handler that returns a synchronous or asynchronous result.
 *
 * @typeParam TQuery - Parsed query input.
 * @typeParam TData - Parsed body input.
 * @typeParam TResult - Handler result.
 * @typeParam TContext - Request-scoped context.
 */
export type EndpointHandler<
  TQuery = undefined,
  TData = undefined,
  TResult = unknown,
  TContext extends EndpointContext = object,
> = (
  args: EndpointHandlerArgs<TQuery, TData, TContext>,
) => TResult | Promise<TResult>;

/**
 * Optional schemas used to validate endpoint query and body inputs.
 *
 * Query parameters are represented as strings or arrays of strings before
 * validation. Zod schemas can coerce or transform them as needed.
 *
 * @typeParam TQuery - Query schema.
 * @typeParam TData - JSON body schema.
 */
type EndpointInput<
  TQuery extends Schema | undefined = undefined,
  TData extends Schema | undefined = undefined,
> = {
  readonly querySchema?: TQuery;
  readonly dataSchema?: TData;
};

/**
 * Configuration for a concrete endpoint.
 *
 * @typeParam TPath - Endpoint path.
 * @typeParam TMethod - HTTP method.
 * @typeParam TQuery - Query schema.
 * @typeParam TData - JSON body schema.
 * @typeParam TResult - Handler result.
 * @typeParam TContext - Request-scoped context.
 */
type EndpointConfig<
  TPath extends string = string,
  TMethod extends HttpMethod = HttpMethod,
  TQuery extends Schema | undefined = undefined,
  TData extends Schema | undefined = undefined,
  TResult = unknown,
  TContext extends EndpointContext = object,
> = {
  readonly path: TPath;
  readonly method: TMethod;
  readonly input?: EndpointInput<TQuery, TData>;
  readonly context?: EndpointContextFactory<TContext>;
  readonly middleware?: readonly EndpointMiddleware<TContext>[];
  readonly handler: EndpointHandler<
    InferSchema<TQuery>,
    InferSchema<TData>,
    TResult,
    TContext
  >;
};

/**
 * Shared configuration for an endpoint registry.
 *
 * @typeParam TBasePath - Shared base path.
 * @typeParam TContext - Registry-provided context.
 */
type EndpointRegistryConfig<
  TBasePath extends string = string,
  TContext extends EndpointContext = object,
> = {
  readonly basePath?: TBasePath;
  readonly context?: EndpointContextFactory<TContext>;
  readonly middleware?: readonly EndpointMiddleware<TContext>[];
};

/**
 * Controls whether registry middleware hooks are inherited by a route.
 *
 * - extend: Execute registry middleware before route-specific middleware.
 * - override: Execute only route-specific middleware.
 */
type MiddlewareMode = "extend" | "override";

/**
 * Configuration for creating an endpoint through an EndpointRegistry.
 *
 * @typeParam TPath - Relative route path.
 * @typeParam TMethod - HTTP method.
 * @typeParam TQuery - Query schema.
 * @typeParam TData - JSON body schema.
 * @typeParam TResult - Handler result.
 * @typeParam TFactoryContext - Registry-provided context.
 * @typeParam TRouteContext - Route context.
 */
type EndpointRouteConfig<
  TPath extends string,
  TMethod extends HttpMethod,
  TQuery extends Schema | undefined,
  TData extends Schema | undefined,
  TResult,
  _TFactoryContext extends EndpointContext,
  TRouteContext extends EndpointContext = EndpointContext,
> = Omit<
  EndpointConfig<TPath, TMethod, TQuery, TData, TResult, TRouteContext>,
  "path" | "context" | "middleware"
> & {
  readonly path: TPath;
  readonly context?: EndpointContextFactory<TRouteContext>;
  readonly middleware?: readonly EndpointMiddleware<TRouteContext>[];
  readonly middlewareMode?: MiddlewareMode;
};

/**
 * Removes trailing slashes from a string literal type.
 */
type TrimTrailingSlash<T extends string> = T extends `${infer R}/`
  ? TrimTrailingSlash<R>
  : T;

/**
 * Ensures a string literal path starts with a slash.
 */
type EnsureLeadingSlash<T extends string> = T extends ""
  ? "/"
  : T extends `/${string}`
    ? T
    : `/${T}`;

/**
 * Joins a base path and a route path at the type level.
 *
 * @typeParam TBasePath - Base path.
 * @typeParam TPath - Relative route path.
 */
export type JoinPaths<
  TBasePath extends string,
  TPath extends string,
> = TPath extends "/" | ""
  ? TBasePath extends "" | "/"
    ? "/"
    : TrimTrailingSlash<TBasePath>
  : TBasePath extends "" | "/"
    ? EnsureLeadingSlash<TPath>
    : `${TrimTrailingSlash<TBasePath>}${EnsureLeadingSlash<TPath>}`;

/**
 * Normalizes a URL pathname by removing empty segments and ensuring
 * that non-root paths begin with exactly one slash.
 *
 * @param path - Path to normalize.
 * @returns The normalized pathname.
 */
function normalizePath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

/**
 * Joins a base path and a route path.
 *
 * @param basePath - Optional base pathname.
 * @param path - Route pathname.
 * @returns The normalized joined pathname.
 */
function joinPaths(basePath: string | undefined, path: string): string {
  const base = normalizePath(basePath ?? "");
  const route = normalizePath(path);

  if (base === "/") {
    return route;
  }
  if (route === "/") {
    return base;
  }

  return `${base}${route}`;
}

/**
 * Converts URL query parameters into a plain object while preserving
 * repeated keys as arrays.
 *
 * Single-value parameters remain strings. Repeated parameters become
 * arrays in their original order.
 *
 * A null-prototype object prevents untrusted query keys from interacting
 * with inherited object properties.
 *
 * @param searchParams - Query parameters from the request URL.
 * @returns A query object suitable for Zod validation.
 */
function parseQueryParams(
  searchParams: URLSearchParams,
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = Object.create(null);

  for (const [key, value] of searchParams) {
    const existing = result[key];

    if (existing === undefined) {
      result[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      result[key] = [existing, value];
    }
  }

  return result;
}

/**
 * Determines whether a request uses a JSON-compatible content type.
 *
 * Supports application/json and structured JSON media types such as
 * application/problem+json.
 *
 * @param request - Incoming request.
 * @returns Whether the content type is JSON-compatible.
 */
function hasJsonContentType(request: Request): boolean {
  const contentTypeHeader = request.headers.get("content-type");
  if (contentTypeHeader === null) {
    return false;
  }

  const parts = contentTypeHeader.split(";", 1);
  const firstPart = parts[0];
  if (firstPart === undefined) {
    return false;
  }

  const contentType = firstPart.trim().toLowerCase();

  return (
    contentType === "application/json" ||
    /^application\/[a-z0-9!#$&^_.+-]+json$/.test(contentType)
  );
}

/**
 * A concrete endpoint.
 *
 * Validates request inputs, resolves request-scoped context, executes
 * middleware hooks, and invokes the configured handler.
 *
 * This class does not register routes, match incoming requests, or convert
 * thrown errors into HTTP responses. Those responsibilities belong to
 * the server adapter.
 *
 * @typeParam TPath - Normalized endpoint path.
 * @typeParam TMethod - HTTP method.
 * @typeParam TQuery - Query schema.
 * @typeParam TData - JSON body schema.
 * @typeParam TResult - Handler result.
 * @typeParam TContext - Request-scoped context.
 */
export class Endpoint<
  TPath extends string = string,
  TMethod extends HttpMethod = HttpMethod,
  TQuery extends Schema | undefined = undefined,
  TData extends Schema | undefined = undefined,
  TResult = unknown,
  TContext extends EndpointContext = object,
> {
  /**
   * Immutable snapshot of the endpoint configuration.
   */
  public readonly config: Readonly<
    EndpointConfig<TPath, TMethod, TQuery, TData, TResult, TContext>
  >;

  /**
   * Normalized endpoint pathname.
   */
  public readonly path: TPath;

  /**
   * HTTP method handled by this endpoint.
   */
  public readonly method: TMethod;

  /**
   * Creates an endpoint.
   *
   * Configuration arrays and objects are shallowly copied and frozen.
   * Nested schemas and function references are not recursively frozen.
   *
   * @param config - Endpoint configuration.
   */
  public constructor(
    config: EndpointConfig<TPath, TMethod, TQuery, TData, TResult, TContext>,
  ) {
    this.path = normalizePath(config.path) as TPath;
    this.method = config.method;

    const input =
      config.input === undefined
        ? undefined
        : Object.freeze({ ...config.input });

    this.config = Object.freeze({
      ...config,
      path: this.path,
      method: this.method,
      ...(input === undefined ? {} : { input }),
      middleware: Object.freeze([...(config.middleware ?? [])]),
    });
  }

  /**
   * Executes the endpoint lifecycle for an incoming request.
   *
   * Execution order:
   *
   * 1. Create response helpers.
   * 2. Resolve request-scoped context.
   * 3. Execute middleware hooks sequentially.
   * 4. Parse and validate query parameters, if configured.
   * 5. Parse and validate the JSON body, if configured.
   * 6. Execute the endpoint handler.
   *
   * Errors are propagated to the caller. A server adapter should translate
   * known application errors into appropriate HTTP responses and safely
   * handle unexpected errors.
   *
   * Body-size limits should be enforced by the server or adapter before
   * consuming untrusted request bodies.
   *
   * @param request - Fetch API request.
   * @returns The resolved handler result.
   * @throws Application errors when input validation or execution fails.
   */
  public async handle(request: Request): Promise<Awaited<TResult>> {
    const response = createResponseHelpers();
    const context = this.config.context
      ? await this.config.context({ request })
      : ({} as TContext);

    for (const middlewareFn of this.config.middleware ?? []) {
      await middlewareFn({
        request,
        context,
        response,
      });
    }

    let query: unknown = undefined;
    let data: unknown = undefined;

    const { querySchema, dataSchema } = this.config.input ?? {};

    if (querySchema !== undefined) {
      const url = new URL(request.url);
      const rawQuery = parseQueryParams(url.searchParams);
      const result = querySchema.safeParse(rawQuery);

      if (!result.success) {
        throw new EndpointError("INVALID_REQUEST");
      }

      query = result.data;
    }

    if (dataSchema !== undefined) {
      if (!hasJsonContentType(request)) {
        throw new EndpointError("BAD_REQUEST");
      }

      let rawData: unknown;

      try {
        rawData = await request.json();
      } catch {
        throw new EndpointError("BAD_REQUEST");
      }

      const result = dataSchema.safeParse(rawData);

      if (!result.success) {
        throw new EndpointError("INVALID_REQUEST");
      }

      data = result.data;
    }

    const args: EndpointHandlerArgs<
      InferSchema<TQuery>,
      InferSchema<TData>,
      TContext
    > = {
      request,
      query: query as InferSchema<TQuery>,
      data: data as InferSchema<TData>,
      context,
      response,
    };

    return await this.config.handler(args);
  }
}

/**
 * Registry for creating and configuring endpoints.
 *
 * Shares a base path, optional request context factory, and middleware hooks
 * across multiple endpoints.
 *
 * Registry middleware executes before route-specific middleware by default. Route
 * context factories may override the registry context completely.
 *
 * @typeParam TBasePath - Shared base pathname.
 * @typeParam TContext - Registry-provided request context.
 */
export class EndpointRegistry<
  TBasePath extends string = "",
  TContext extends EndpointContext = object,
> {
  /**
   * Normalized base pathname shared by this registry's routes.
   */
  public readonly basePath: TBasePath;

  /**
   * Immutable snapshot of the registry configuration.
   */
  public readonly config: Readonly<EndpointRegistryConfig<TBasePath, TContext>>;

  /**
   * Creates an endpoint registry.
   *
   * @param config - Shared registry configuration.
   */
  public constructor(config: EndpointRegistryConfig<TBasePath, TContext> = {}) {
    this.basePath = normalizePath(config.basePath ?? "") as TBasePath;
    this.config = Object.freeze({
      ...config,
      basePath: this.basePath,
      middleware: Object.freeze([...(config.middleware ?? [])]),
    });
  }

  /**
   * Creates a concrete endpoint using registry defaults.
   *
   * The route path is joined to the registry base path. The resulting
   * endpoint retains its literal path, method, schema, result, and context
   * types.
   *
   * @typeParam TPath - Relative route path.
   * @typeParam TMethod - HTTP method.
   * @typeParam TQuery - Query schema.
   * @typeParam TData - JSON body schema.
   * @typeParam TResult - Handler result.
   * @typeParam TRouteContext - Route context type.
   *
   * @param config - Route configuration and optional overrides.
   * @returns A concrete endpoint.
   */
  public create<
    const TPath extends string,
    TMethod extends HttpMethod,
    TQuery extends Schema | undefined = undefined,
    TData extends Schema | undefined = undefined,
    TResult = unknown,
    TRouteContext extends EndpointContext = TContext,
  >(
    config: EndpointRouteConfig<
      TPath,
      TMethod,
      TQuery,
      TData,
      TResult,
      TContext,
      TRouteContext
    >,
  ): Endpoint<
    JoinPaths<TBasePath, TPath>,
    TMethod,
    TQuery,
    TData,
    TResult,
    TRouteContext
  > {
    const {
      middlewareMode = "extend",
      middleware: routeMiddleware = [],
      context: routeContext,
      path,
      ...routeConfig
    } = config;

    const inheritedMiddleware: readonly EndpointMiddleware<TRouteContext>[] =
      middlewareMode === "override"
        ? []
        : ((this.config.middleware ??
            []) as unknown as readonly EndpointMiddleware<TRouteContext>[]);

    const resolvedContext =
      routeContext !== undefined ? routeContext : this.config.context;

    const resolvedConfig: EndpointConfig<
      JoinPaths<TBasePath, TPath>,
      TMethod,
      TQuery,
      TData,
      TResult,
      TRouteContext
    > = {
      ...routeConfig,
      path: joinPaths(this.basePath, path) as JoinPaths<TBasePath, TPath>,
      ...(resolvedContext === undefined
        ? {}
        : {
            context: resolvedContext as EndpointContextFactory<TRouteContext>,
          }),
      middleware: [...inheritedMiddleware, ...routeMiddleware],
    };

    return new Endpoint(resolvedConfig);
  }
}
