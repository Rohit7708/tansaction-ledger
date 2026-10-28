import axios, { isAxiosError } from 'axios';
import type { ErrorDetail, ErrorResponse } from '../types/api';

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});

/** Normalized error for anything that goes wrong talking to the API. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number | null,
    public readonly details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Validation messages keyed by request field, for showing next to form inputs. */
  fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const detail of this.details) {
      result[detail.field] ??= detail.message;
    }
    return result;
  }
}

const isErrorResponse = (value: unknown): value is ErrorResponse =>
  typeof value === 'object' &&
  value !== null &&
  'success' in value &&
  value.success === false &&
  'error' in value &&
  typeof value.error === 'object' &&
  value.error !== null;

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (isAxiosError(error)) {
    const status = error.response?.status ?? null;
    const body: unknown = error.response?.data;
    if (isErrorResponse(body)) {
      return new ApiError(body.error.message, body.error.code, status, body.error.details);
    }
    if (!error.response) {
      return new ApiError('Cannot reach the server. Check that the backend is running.', 'NETWORK_ERROR', null);
    }
    return new ApiError(`Request failed with status ${status}.`, 'HTTP_ERROR', status);
  }
  return new ApiError('Something went wrong.', 'UNKNOWN_ERROR', null);
}

/** Runs an API call and rethrows failures as ApiError. */
export async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    const response = await call();
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
}
