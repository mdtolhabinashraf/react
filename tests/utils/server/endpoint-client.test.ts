import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectTypeOf } from "vitest";
import type { ApiResponse } from "apexa";
import { EndpointClient } from "../../../src/utils/server/endpoint-client";

/* -------------------------------------------------------------------------- */
/*                                  Fixtures                                  */
/* -------------------------------------------------------------------------- */

type SignupResult = {
  message: "Signup successful";
  username: string;
};

type SignupGetResult = {
  message: "Signup get successful";
  username: string;
  found: true;
};

type Signup = {
  readonly path: "/auth/sign-up/";
  readonly method: "POST";
  readonly query: undefined;
  readonly data: {
    username: string;
    password: string;
  };
  readonly result: SignupResult;
};

type SignupGet = {
  readonly path: "/auth/sign-up/";
  readonly method: "GET";
  readonly query: {
    username: string;
  };
  readonly data: undefined;
  readonly result: SignupGetResult;
};

type UpdateUser = {
  readonly path: "/users/[userId]";
  readonly method: "PATCH";
  readonly query: undefined;
  readonly data: {
    name: string;
  };
  readonly result: {
    id: string;
    name: string;
  };
};

type DeleteUser = {
  readonly path: "/users/[userId]";
  readonly method: "DELETE";
  readonly query: undefined;
  readonly data: undefined;
  readonly result: {
    deleted: true;
  };
};

/* -------------------------------------------------------------------------- */
/*                                Mock Apexa                                  */
/* -------------------------------------------------------------------------- */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  head: vi.fn(),
  options: vi.fn(),
  request: vi.fn(),
}));

vi.mock("apexa", () => ({
  Apexa: class MockApexa {
    get = mocks.get;
    post = mocks.post;
    put = mocks.put;
    patch = mocks.patch;
    delete = mocks.delete;
    head = mocks.head;
    options = mocks.options;
    request = mocks.request;
  },
}));

/* -------------------------------------------------------------------------- */
/*                              Runtime Tests                                 */
/* -------------------------------------------------------------------------- */

describe("EndpointClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.get.mockResolvedValue({
      data: {
        message: "Signup get successful",
        username: "testuser",
        found: true,
      },
    });

    mocks.post.mockResolvedValue({
      data: {
        message: "Signup successful",
        username: "testuser",
      },
    });

    mocks.patch.mockResolvedValue({
      data: {
        id: "user-1",
        name: "Tolha",
      },
    });

    mocks.delete.mockResolvedValue({
      data: {
        deleted: true,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("shared routes", () => {
    it("dispatches POST to the correct path with request data", async () => {
      const client = new EndpointClient<[Signup, SignupGet]>();

      const data = {
        username: "testuser",
        password: "password123",
      };

      await client.api.auth.signUp.post({ data });

      expect(mocks.post).toHaveBeenCalledTimes(1);
      expect(mocks.post).toHaveBeenCalledWith("/auth/sign-up", data, {});
    });

    it("dispatches GET to the same path with query options", async () => {
      const client = new EndpointClient<[Signup, SignupGet]>();

      const query = {
        username: "testuser",
      };

      await client.api.auth.signUp.get({ query });

      expect(mocks.get).toHaveBeenCalledTimes(1);
      expect(mocks.get).toHaveBeenCalledWith("/auth/sign-up", { query });
    });

    it("exposes both methods as functions", () => {
      const client = new EndpointClient<[Signup, SignupGet]>();

      expect(typeof client.api.auth.signUp.post).toBe("function");
      expect(typeof client.api.auth.signUp.get).toBe("function");
    });

    it("normalizes trailing slashes", async () => {
      const client = new EndpointClient<[Signup]>();

      await client.api.auth.signUp.post({
        data: {
          username: "testuser",
          password: "password123",
        },
      });

      expect(mocks.post).toHaveBeenCalledWith(
        "/auth/sign-up",
        {
          username: "testuser",
          password: "password123",
        },
        {},
      );
    });
  });

  describe("request options", () => {
    it("translates data into Apexa's body argument without mutation", async () => {
      const client = new EndpointClient<[Signup]>();

      const options = {
        data: {
          username: "testuser",
          password: "password123",
        },
      };

      await client.api.auth.signUp.post(options);

      expect(mocks.post).toHaveBeenCalledWith(
        "/auth/sign-up",
        options.data,
        {},
      );

      expect(options).toEqual({
        data: {
          username: "testuser",
          password: "password123",
        },
      });
    });

    it("forwards additional request options", async () => {
      const client = new EndpointClient<[Signup]>();

      await client.api.auth.signUp.post({
        data: {
          username: "testuser",
          password: "password123",
        },
        headers: {
          "x-request-id": "test-request",
        },
      });

      expect(mocks.post).toHaveBeenCalledWith(
        "/auth/sign-up",
        {
          username: "testuser",
          password: "password123",
        },
        {
          headers: {
            "x-request-id": "test-request",
          },
        },
      );
    });

    it("does not forward data as an extra request option", async () => {
      const client = new EndpointClient<[Signup]>();

      await client.api.auth.signUp.post({
        data: {
          username: "testuser",
          password: "password123",
        },
      });

      const requestOptions = mocks.post.mock.calls[0]?.[2];

      expect(requestOptions).not.toHaveProperty("data");
      expect(requestOptions).not.toHaveProperty("body");
    });
  });

  describe("nested and direct access", () => {
    it("supports direct route access", async () => {
      const client = new EndpointClient<[Signup]>();

      await client.auth.signUp.post({
        data: {
          username: "testuser",
          password: "password123",
        },
      });

      expect(mocks.post).toHaveBeenCalledWith(
        "/auth/sign-up",
        {
          username: "testuser",
          password: "password123",
        },
        {},
      );
    });

    it("supports PATCH and DELETE on the same dynamic route", async () => {
      const client = new EndpointClient<[UpdateUser, DeleteUser]>();

      await client.api.users.userId.patch({
        data: {
          name: "Tolha",
        },
      });

      await client.api.users.userId.delete();

      expect(mocks.patch).toHaveBeenCalledWith(
        "/users/user-id",
        { name: "Tolha" },
        {},
      );

      expect(mocks.delete).toHaveBeenCalledWith("/users/user-id", {});
    });
  });

  describe("instance properties", () => {
    it("exposes the underlying Apexa client and nested API", () => {
      const client = new EndpointClient<[Signup]>();

      expect(client.client).toBeDefined();
      expect(client.api).toBeDefined();
    });
  });
});

/* -------------------------------------------------------------------------- */
/*                         Compile-Time Type Tests                            */
/* -------------------------------------------------------------------------- */

/**
 * These assertions validate the public type contract.
 *
 * Run `pnpm typecheck` to ensure the tests compile.
 */
describe("EndpointClient type inference", () => {
  it("keeps GET and POST responses independent on a shared path", () => {
    const client = new EndpointClient<[Signup, SignupGet]>();

    const postPromise = client.api.auth.signUp.post({
      data: {
        username: "testuser",
        password: "password123",
      },
    });

    const getPromise = client.api.auth.signUp.get({
      query: {
        username: "testuser",
      },
    });

    expectTypeOf(postPromise).toEqualTypeOf<
      Promise<ApiResponse<SignupResult>>
    >();

    expectTypeOf(getPromise).toEqualTypeOf<
      Promise<ApiResponse<SignupGetResult>>
    >();
  });

  it("infers the POST data type", () => {
    const client = new EndpointClient<[Signup, SignupGet]>();

    type PostOptions = Parameters<typeof client.api.auth.signUp.post>[0];

    expectTypeOf<PostOptions["data"]>().toEqualTypeOf<Signup["data"]>();
  });

  it("accepts the GET endpoint's query type", () => {
    const client = new EndpointClient<[Signup, SignupGet]>();

    type GetOptions = Parameters<typeof client.api.auth.signUp.get>[0];

    const options: GetOptions = {
      query: {
        username: "testuser",
      },
    };

    expectTypeOf(options.query).toEqualTypeOf<SignupGet["query"]>();
  });

  it("keeps the GET options parameter optional when appropriate", () => {
    const client = new EndpointClient<[SignupGet]>();

    type GetParameters = Parameters<typeof client.api.auth.signUp.get>;

    expectTypeOf<GetParameters>().toEqualTypeOf<[options?: GetParameters[0]]>();
  });

  it("preserves PATCH and DELETE on the same route", () => {
    const client = new EndpointClient<[UpdateUser, DeleteUser]>();

    expectTypeOf(client.api.users.userId.patch).toBeFunction();
    expectTypeOf(client.api.users.userId.delete).toBeFunction();

    const patchPromise = client.api.users.userId.patch({
      data: {
        name: "Tolha",
      },
    });

    const deletePromise = client.api.users.userId.delete();

    expectTypeOf(patchPromise).toEqualTypeOf<
      Promise<ApiResponse<UpdateUser["result"]>>
    >();

    expectTypeOf(deletePromise).toEqualTypeOf<
      Promise<ApiResponse<DeleteUser["result"]>>
    >();
  });

  it("preserves responses for unrelated routes", () => {
    const client = new EndpointClient<[Signup, UpdateUser]>();

    const signupPromise = client.api.auth.signUp.post({
      data: {
        username: "testuser",
        password: "password123",
      },
    });

    const updatePromise = client.api.users.userId.patch({
      data: {
        name: "Tolha",
      },
    });

    expectTypeOf(signupPromise).toEqualTypeOf<
      Promise<ApiResponse<SignupResult>>
    >();

    expectTypeOf(updatePromise).toEqualTypeOf<
      Promise<ApiResponse<UpdateUser["result"]>>
    >();
  });
});
