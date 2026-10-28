import type { Account, SuccessResponse } from '../types/api';
import { http, request } from './http';

export const accountsApi = {
  list: async () => (await request(() => http.get<SuccessResponse<Account[]>>('/accounts'))).data,

  get: async (accountId: string) =>
    (await request(() => http.get<SuccessResponse<Account>>(`/accounts/${encodeURIComponent(accountId)}`))).data,

  create: async (name: string) =>
    (await request(() => http.post<SuccessResponse<Account>>('/accounts', { name }))).data,
};
