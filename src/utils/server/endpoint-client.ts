/**
 * Type-safe endpoint client built on top of Apexa.
 *
 * Converts inferred server endpoint definitions into a nested client API.
 *
 * Features:
 * - Independently typed HTTP methods for each route.
 * - Preserved request, query, and response types.
 * - Support for multiple methods on the same path.
 * - Nested route access using camelCase properties.
 * - Direct route access and `.api` access.
 * - Lazy proxy-based request execution.
 *
 * @packageDocumentation
 */

import {
  Apexa,
  type ApiResponse,
  type ClientOptions,
  type HttpMethod,
  type RequestOptions,
} from "apexa";

/* -------------------------------------------------------------------------- */
/*                                  Utilities                                 */
/* -------------------------------------------------------------------------- */

/**
 * Converts kebab-case strings to camelCase.
 *
 * @example
 * CamelCase<"sign-up"> // "signUp"
 */
type CamelCase<T extends string> = T extends `${infer Head}-${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : T;

/**
 * Converts camelCase property names into kebab-case URL segments.
 *
 * @example
 * toKebabCase("signUp") // "sign-up"
 */
function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

/**
 * Checks whether a value is a non-null object record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalizes a URL path.
 *
 * Removes duplicate slashes and trailing slashes while preserving
 * the root path.
 */
function normalizePath(path: string): string {
  const normalized = path.replace(/\/+/g, "/").replace(/\/+$/, "");

  return normalized || "/";
}

/* -------------------------------------------------------------------------- */
/*                              Endpoint Inference                            */
/* -------------------------------------------------------------------------- */

/**
 * Minimum inferred endpoint definition required by the client.
 *
 * The endpoint registry must preserve literal path and method types.
 */
type EndpointInferRecord = {
  readonly path: string;
  readonly method: string;
  readonly query: unknown;
  readonly data: unknown;
  readonly result: unknown;
};

/**
 * Request options managed by Apexa and shared with the endpoint client.
 *
 * The client exposes `data` instead of Apexa's `body`, and determines
 * the HTTP method from the endpoint definition.
 */
type EndpointRequestOptions = Omit<RequestOptions, "body" | "method" | "query">;

/**
 * Makes query optional only when undefined is allowed by its type.
 */
type QueryOptions<TQuery> = undefined extends TQuery
  ? { query?: TQuery }
  : { query: TQuery };

/**
 * Request options for methods that do not require a request body.
 */
type ReadRequestOptions<TQuery> = EndpointRequestOptions & QueryOptions<TQuery>;

/**
 * Request options for methods that accept request data.
 */
type MutationRequestOptions<TQuery, TData> = EndpointRequestOptions &
  QueryOptions<TQuery> &
  (undefined extends TData ? { data?: TData } : { data: TData });

/* -------------------------------------------------------------------------- */
/*                               Method Mapping                               */
/* -------------------------------------------------------------------------- */

/**
 * Supported HTTP methods.
 */
type SupportedMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "head"
  | "options";

/**
 * Maps one endpoint definition to its HTTP method property.
 *
 * This type intentionally uses a mapped type instead of distributing
 * a conditional over the method string.
 *
 * Each endpoint contributes its own result type to its own method.
 */
type LeafMethod<TMethod extends string, TQuery, TData, TResult> = {
  [M in Lowercase<TMethod> as M extends SupportedMethod ? M : never]: M extends
    | "get"
    | "delete"
    | "head"
    | "options"
    ? (options?: ReadRequestOptions<TQuery>) => Promise<ApiResponse<TResult>>
    : M extends "post" | "put" | "patch"
      ? (
          options: MutationRequestOptions<TQuery, TData>,
        ) => Promise<ApiResponse<TResult>>
      : never;
};

/* -------------------------------------------------------------------------- */
/*                               Route Tree Types                             */
/* -------------------------------------------------------------------------- */

/**
 * Removes one trailing slash from a path type.
 */
type StripTrailingSlash<T extends string> = T extends `${infer Rest}/`
  ? StripTrailingSlash<Rest>
  : T;

/**
 * Converts a path into a nested route tree.
 *
 * Examples:
 *
 * "/auth/sign-up"
 *   -> { auth: { signUp: { post: ... } } }
 *
 * "/users/[userId]/posts"
 *   -> { users: { [key: string]: { posts: ... } } }
 *
 * Dynamic segments are represented as string-indexed properties.
 * Runtime parameter interpolation is not implemented by this client.
 */
type PathSegmentsToTree<
  TSegments extends string,
  TMethod extends string,
  TQuery,
  TData,
  TResult,
> = TSegments extends `${infer Segment}/${infer Rest}`
  ? Segment extends ""
    ? PathSegmentsToTree<Rest, TMethod, TQuery, TData, TResult>
    : Segment extends `[${string}]`
      ? {
          [K in string]: PathSegmentsToTree<
            Rest,
            TMethod,
            TQuery,
            TData,
            TResult
          >;
        }
      : {
          [K in CamelCase<Segment>]: PathSegmentsToTree<
            Rest,
            TMethod,
            TQuery,
            TData,
            TResult
          >;
        }
  : TSegments extends ""
    ? LeafMethod<TMethod, TQuery, TData, TResult>
    : TSegments extends `[${string}]`
      ? {
          [K in string]: LeafMethod<TMethod, TQuery, TData, TResult>;
        }
      : {
          [K in CamelCase<TSegments>]: LeafMethod<
            TMethod,
            TQuery,
            TData,
            TResult
          >;
        };

/**
 * Converts a normalized path into a client route tree.
 */
type PathToClientTree<
  TPath extends string,
  TMethod extends string,
  TQuery,
  TData,
  TResult,
> = PathSegmentsToTree<
  StripTrailingSlash<TPath extends `/${infer Rest}` ? Rest : TPath>,
  TMethod,
  TQuery,
  TData,
  TResult
>;

/* -------------------------------------------------------------------------- */
/*                              Endpoint Tree Types                           */
/* -------------------------------------------------------------------------- */

/**
 * Converts one endpoint definition into its route tree.
 */
type ExtractEndpointTree<T extends EndpointInferRecord> = PathToClientTree<
  T["path"],
  T["method"],
  T["query"],
  T["data"],
  T["result"]
>;

/**
 * Distributes endpoint conversion over the endpoint union.
 *
 * Keeping this as a separate generic conditional is important:
 * each endpoint must retain its own method, query, data, and result types
 * before the resulting route trees are merged.
 */
type EndpointTreeUnion<T> = T extends EndpointInferRecord
  ? ExtractEndpointTree<T>
  : never;

/**
 * Converts a union into an intersection.
 */
type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer U) => void
  ? U
  : never;

/**
 * Recursively merges route trees.
 *
 * Function leaves are preserved.
 * Object properties contributed by multiple endpoints are combined.
 * Optional property modifiers introduced during composition are removed.
 *
 * Different HTTP methods at the same route remain independent properties.
 */
type MergeClientTrees<T> = [T] extends [(...args: never[]) => unknown]
  ? T
  : [T] extends [object]
    ? {
        [K in keyof UnionToIntersection<T>]-?: MergeClientTrees<
          UnionToIntersection<T>[K]
        >;
      }
    : T;

/**
 * Final client API tree.
 */
type ClientTree<TEndpoints extends readonly EndpointInferRecord[]> =
  MergeClientTrees<EndpointTreeUnion<TEndpoints[number]>>;

/* -------------------------------------------------------------------------- */
/*                               Public Client API                            */
/* -------------------------------------------------------------------------- */

/**
 * Typed endpoint client instance.
 *
 * Both `client.api.auth.signUp.post(...)` and
 * `client.auth.signUp.post(...)` are supported.
 */
export type EndpointClientInstance<
  TEndpoints extends readonly EndpointInferRecord[],
> = {
  /** Underlying Apexa HTTP client. */
  readonly client: Apexa;

  /** Nested, type-safe API. */
  readonly api: ClientTree<TEndpoints>;
} & ClientTree<TEndpoints>;

/**
 * Generic constructor signature.
 */
export interface EndpointClientConstructor {
  new <TEndpoints extends readonly EndpointInferRecord[]>(
    options?: ClientOptions,
  ): EndpointClientInstance<TEndpoints>;
}

/* -------------------------------------------------------------------------- */
/*                          Endpoint Client Implementation                    */
/* -------------------------------------------------------------------------- */

/**
 * Runtime-supported HTTP methods.
 */
const HTTP_METHODS = new Set<string>([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);

/**
 * Internal endpoint client implementation.
 */
class EndpointClientImpl<TEndpoints extends readonly EndpointInferRecord[]> {
  public readonly client: Apexa;

  public readonly api: ClientTree<TEndpoints>;

  public constructor(options?: ClientOptions) {
    this.client = new Apexa(options);
    this.api = this.createProxy([]) as ClientTree<TEndpoints>;

    /**
     * Expose route access at the instance root without overriding
     * existing client properties.
     */
    return new Proxy(this, {
      get: (target, property, receiver) => {
        if (typeof property === "symbol" || Reflect.has(target, property)) {
          return Reflect.get(target, property, receiver);
        }

        return this.createProxy([String(property)]);
      },
    }) as this;
  }

  /**
   * Creates a lazy proxy representing a nested API route.
   */
  private createProxy(segments: string[]): unknown {
    return new Proxy(() => undefined, {
      get: (target, property) => {
        if (typeof property === "symbol") {
          return Reflect.get(target, property);
        }

        /**
         * Prevent route proxies from being treated as promises.
         */
        if (property === "then") {
          return undefined;
        }

        const method = property.toLowerCase();

        if (!HTTP_METHODS.has(method)) {
          return this.createProxy([...segments, property]);
        }

        return async (requestOptions?: unknown) => {
          const path = normalizePath(
            "/" + segments.map((segment) => toKebabCase(segment)).join("/"),
          );

          const options: Record<string, unknown> = isRecord(requestOptions)
            ? { ...requestOptions }
            : {};

          /**
           * Translate public `data` to Apexa's `body`.
           * The caller's request object is never mutated.
           */
          const data = options.data as RequestOptions["body"] | undefined;

          delete options.data;

          const requestConfig = options as RequestOptions;

          switch (method) {
            case "get":
              return this.client.get(path, requestConfig);

            case "post":
              return this.client.post(path, data, requestConfig);

            case "put":
              return this.client.put(path, data, requestConfig);

            case "patch":
              return this.client.patch(path, data, requestConfig);

            case "delete":
              return this.client.delete(path, requestConfig);

            case "head":
              return this.client.head(path, requestConfig);

            case "options":
              return this.client.options(path, requestConfig);

            default:
              return this.client.request(path, {
                ...requestConfig,
                method: method.toUpperCase() as HttpMethod,
                ...(data !== undefined ? { body: data } : {}),
              });
          }
        };
      },
    });
  }
}

/**
 * Type-safe endpoint client with inferred route access.
 *
 * @example
 * ```ts
 * const client = new EndpointClient<[Signup, SignupGet]>({
 *   baseUrl: "http://localhost:3000",
 * });
 *
 * const created = await client.api.auth.signUp.post({
 *   data: {
 *     username: "testuser",
 *     password: "password123",
 *   },
 * });
 *
 * const existing = await client.api.auth.signUp.get({
 *   query: {
 *     username: "testuser",
 *   },
 * });
 * ```
 */
export const EndpointClient =
  EndpointClientImpl as unknown as EndpointClientConstructor;
