/** Shapes returned by the backend REST API. Money is always a decimal string, e.g. "100.00". */

export interface Account {
  id: string;
  name: string;
  balance: string;
  created_at: string;
  updated_at: string;
}

export type TransactionType = 'credit' | 'debit';

export interface Transaction {
  id: string;
  account_id: string;
  type: TransactionType;
  amount: string;
  description: string;
  reference_id: string;
  transfer_id: string | null;
  created_at: string;
}

export interface Pagination {
  current_page: number;
  page_size: number;
  total_records: number;
  total_pages: number;
}

export interface Transfer {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount: string;
  description: string;
  reference_id: string;
  created_at: string;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface PaginatedResponse<T> extends SuccessResponse<T[]> {
  pagination: Pagination;
}

export interface ErrorDetail {
  field: string;
  message: string;
}

export interface ErrorResponse {
  success: false;
  error: { code: string; message: string; details?: ErrorDetail[] };
}

export interface CreateTransactionRequest {
  type: TransactionType;
  amount: string;
  description: string;
  reference_id: string;
}

export interface CreateTransactionResult {
  transaction: Transaction;
  account: Account;
}

export interface CreateTransferRequest {
  from_account_id: string;
  to_account_id: string;
  amount: string;
  reference_id: string;
  description: string;
}

export interface CreateTransferResult {
  transfer: Transfer;
  debit_transaction: Transaction;
  credit_transaction: Transaction;
  from_account: Account;
  to_account: Account;
}
