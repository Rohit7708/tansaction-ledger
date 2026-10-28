import type { Account } from '@prisma/client';
import { accountNotFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { CreateAccountInput } from './account.schemas.js';

export const accountService = {
  /** New accounts always start at the database default balance of 0.00. */
  create(input: CreateAccountInput): Promise<Account> {
    return prisma.account.create({ data: { name: input.name } });
  },

  list(): Promise<Account[]> {
    return prisma.account.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  },

  async getById(accountId: string): Promise<Account> {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      throw accountNotFound();
    }
    return account;
  },
};
