import type { CreateTransferRequest, CreateTransferResult, SuccessResponse } from '../types/api';
import { http, request } from './http';

export const transfersApi = {
  create: async (body: CreateTransferRequest) =>
    (await request(() => http.post<SuccessResponse<CreateTransferResult>>('/transfers', body))).data,
};
