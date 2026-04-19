/**
 * googleApiFetch.test.ts
 *
 * Tests for the Google API retry wrapper.
 */

// Mock ErrorRecoveryService before importing
jest.mock("../services/ErrorRecoveryService", () => ({
  recordFailure: jest.fn(),
  markResolved: jest.fn(),
  onNetworkFailure: jest.fn(),
}));

import { googleApiFetch } from "../services/googleApiFetch";
import { recordFailure, markResolved, onNetworkFailure } from "../services/ErrorRecoveryService";

const mockRecordFailure = recordFailure as jest.Mock;
const mockMarkResolved = markResolved as jest.Mock;
const mockOnNetworkFailure = onNetworkFailure as jest.Mock;

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
});

function makeResponse(status: number, body: any = {}, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name] || null,
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as any;
}

describe("googleApiFetch", () => {
  it("returns 200 response immediately", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { data: "ok" }));

    const res = await googleApiFetch("https://api.example.com/test", undefined, {
      maxRetries: 3,
      baseDelayMs: 10,
      operationKey: "test",
    });

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockMarkResolved).not.toHaveBeenCalled();
  });

  it("returns 400 without retry (terminal client error)", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(400, { error: "bad request" }));

    const res = await googleApiFetch("https://api.example.com/test", undefined, {
      maxRetries: 3,
      baseDelayMs: 10,
      operationKey: "test",
    });

    expect(res.status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns 401 without retry (terminal auth error)", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(401));

    const res = await googleApiFetch("https://api.example.com/test", undefined, {
      maxRetries: 3,
      baseDelayMs: 10,
      operationKey: "test",
    });

    expect(res.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries 429 and succeeds on second attempt", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(429, {}, { "Retry-After": "1" }))
      .mockResolvedValueOnce(makeResponse(200, { data: "ok" }));

    const res = await googleApiFetch("https://api.example.com/test", undefined, {
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 100,
      operationKey: "test-429",
    });

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockMarkResolved).toHaveBeenCalledWith("api:test-429");
  });

  it("retries 500 and succeeds on second attempt", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(500))
      .mockResolvedValueOnce(makeResponse(200, { data: "ok" }));

    const res = await googleApiFetch("https://api.example.com/test", undefined, {
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 100,
      operationKey: "test-500",
    });

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockMarkResolved).toHaveBeenCalledWith("api:test-500");
  });

  it("exhausts retries on persistent 429 and records failure", async () => {
    mockFetch
      .mockResolvedValue(makeResponse(429, {}, { "Retry-After": "0" }));

    const res = await googleApiFetch("https://api.example.com/test", undefined, {
      maxRetries: 2,
      baseDelayMs: 10,
      maxDelayMs: 50,
      operationKey: "test-exhausted",
    });

    expect(res.status).toBe(429);
    expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(mockRecordFailure).toHaveBeenCalledWith(
      "api:test-exhausted",
      expect.any(Error)
    );
  });

  it("exhausts retries on persistent 503 and records failure", async () => {
    mockFetch.mockResolvedValue(makeResponse(503));

    const res = await googleApiFetch("https://api.example.com/test", undefined, {
      maxRetries: 1,
      baseDelayMs: 10,
      maxDelayMs: 50,
      operationKey: "test-503",
    });

    expect(res.status).toBe(503);
    expect(mockFetch).toHaveBeenCalledTimes(2); // initial + 1 retry
    expect(mockRecordFailure).toHaveBeenCalled();
  });

  it("retries network errors and throws after exhaustion", async () => {
    mockFetch.mockRejectedValue(new Error("Network request failed"));

    await expect(
      googleApiFetch("https://api.example.com/test", undefined, {
        maxRetries: 1,
        baseDelayMs: 10,
        maxDelayMs: 50,
        operationKey: "test-network",
      })
    ).rejects.toThrow("Network request failed");

    expect(mockFetch).toHaveBeenCalledTimes(2); // initial + 1 retry
    expect(mockOnNetworkFailure).toHaveBeenCalledWith(
      "test-network",
      expect.any(Error)
    );
  });

  it("passes through request init (headers, method, body)", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200));

    await googleApiFetch(
      "https://api.example.com/test",
      {
        method: "POST",
        headers: { Authorization: "Bearer token123" },
        body: JSON.stringify({ key: "value" }),
      },
      { operationKey: "test-init" }
    );

    expect(mockFetch).toHaveBeenCalledWith("https://api.example.com/test", {
      method: "POST",
      headers: { Authorization: "Bearer token123" },
      body: JSON.stringify({ key: "value" }),
    });
  });
});
