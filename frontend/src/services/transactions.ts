import type {
  CreateTransactionRequest,
  CreateTransactionResult,
  PaginatedResponse,
  SuccessResponse,
  Transaction,
} from '../types/api';
import { http, request } from './http';

const path = (accountId: string) => `/accounts/${encodeURIComponent(accountId)}/transactions`;

export const transactionsApi = {
  list: (accountId: string, page: number, limit: number) =>
    request(() => http.get<PaginatedResponse<Transaction>>(path(accountId), { params: { page, limit } })),

  create: async (accountId: string, body: CreateTransactionRequest) =>
    (await request(() => http.post<SuccessResponse<CreateTransactionResult>>(path(accountId), body))).data,
};
