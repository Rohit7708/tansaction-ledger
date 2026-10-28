export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_ACCOUNT_ID'
  | 'INVALID_PAGINATION'
  | 'INVALID_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'ACCOUNT_NOT_FOUND'
  | 'SOURCE_ACCOUNT_NOT_FOUND'
  | 'DESTINATION_ACCOUNT_NOT_FOUND'
  | 'SAME_ACCOUNT_TRANSFER'
  | 'ROUTE_NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'DUPLICATE_TRANSACTION'
  | 'DUPLICATE_TRANSFER'
  | 'INSUFFICIENT_BALANCE'
  | 'CONFLICT'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_SERVER_ERROR';

export interface ErrorDetail {
  field: string;
  message: string;
}

/** An error that is safe to return to API clients. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const accountNotFound = (code: ErrorCode = 'ACCOUNT_NOT_FOUND', message = 'Account not found.') =>
  new AppError(404, code, message);

export const insufficientBalance = () =>
  new AppError(409, 'INSUFFICIENT_BALANCE', 'The account does not have sufficient balance.');
