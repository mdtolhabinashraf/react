/**
 * Compile-time marker that associates a response with its body type.
 */
declare const responseBodyType: unique symbol;

/**
 * Native HTTP response carrying a compile-time body type.
 *
 * @typeParam TBody - The type of the response body.
 */
export type TypedResponse<TBody = unknown> = Response & {
  readonly [responseBodyType]?: TBody;
};

export type EndpointResponseHelpers = {
  /**
   * Creates a JSON response while preserving the inferred body type.
   *
   * @typeParam TBody - JSON body type.
   * @param body - Value to serialize.
   * @param init - Optional response configuration.
   */
  json<TBody>(body: TBody, init?: ResponseInit): TypedResponse<TBody>;

  /**
   * Creates a plain-text response.
   *
   * @param body - Text response body.
   * @param init - Optional response configuration.
   */
  text(body: string, init?: ResponseInit): TypedResponse<string>;

  /**
   * Creates an HTML response.
   *
   * @param body - HTML response body.
   * @param init - Optional response configuration.
   */
  html(body: string, init?: ResponseInit): TypedResponse<string>;

  /**
   * Creates a redirect response.
   *
   * @param url - Redirect destination.
   * @param status - HTTP redirect status.
   */
  redirect(url: string | URL, status?: 301 | 302 | 303 | 307 | 308): Response;

  /**
   * Returns an existing native response unchanged.
   *
   * @param response - Response to return.
   */
  raw(response: Response): Response;
};

/**
 * Creates response helpers for endpoint handlers.
 *
 * @returns Typed JSON, text, HTML, redirect, and raw response helpers.
 */
export function createResponseHelpers(): EndpointResponseHelpers {
  return {
    /**
     * Creates a JSON response and preserves its inferred body type.
     *
     * @typeParam TBody - JSON body type.
     * @param body - Value to serialize.
     * @param init - Optional response configuration.
     * @returns Native response associated with TBody.
     */
    json<TBody>(body: TBody, init?: ResponseInit): TypedResponse<TBody> {
      const headers = new Headers(init?.headers);

      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json; charset=utf-8");
      }

      return Response.json(body, {
        ...init,
        headers,
      }) as TypedResponse<TBody>;
    },

    /**
     * Creates a plain-text response.
     *
     * @param body - Text body.
     * @param init - Optional response configuration.
     */
    text(body: string, init?: ResponseInit): TypedResponse<string> {
      const headers = new Headers(init?.headers);

      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "text/plain; charset=utf-8");
      }

      return new Response(body, {
        ...init,
        headers,
      }) as TypedResponse<string>;
    },

    /**
     * Creates an HTML response.
     *
     * @param body - HTML body.
     * @param init - Optional response configuration.
     */
    html(body: string, init?: ResponseInit): TypedResponse<string> {
      const headers = new Headers(init?.headers);

      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "text/html; charset=utf-8");
      }

      return new Response(body, {
        ...init,
        headers,
      }) as TypedResponse<string>;
    },

    /**
     * Creates an HTTP redirect.
     *
     * @param url - Redirect destination.
     * @param status - Redirect status code.
     */
    redirect(
      url: string | URL,
      status: 301 | 302 | 303 | 307 | 308 = 302,
    ): Response {
      return Response.redirect(url, status);
    },

    /**
     * Returns an existing response unchanged.
     *
     * @param response - Response to return.
     */
    raw(response: Response): Response {
      return response;
    },
  };
}
