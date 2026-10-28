import { type FormEvent, useRef, useState } from 'react';
import { useToast } from '../hooks/useToast';
import { formatMoney, normalizeAmount, toCents, validateAmount } from '../lib/money';
import { generateReference, validateReference } from '../lib/format';
import { toApiError } from '../services/http';
import { transactionsApi } from '../services/transactions';
import type { TransactionType } from '../types/api';
import { Button, TextField } from './ui';

interface Props {
  accountId: string;
  /** Current balance as last confirmed by the server; used only for a client-side hint. */
  balance: string;
  onSuccess: () => void;
}

type FieldErrors = Partial<Record<'type' | 'amount' | 'description' | 'reference_id', string>>;

const DESCRIPTION_MAX = 255;

export function TransactionForm({ accountId, balance, onSuccess }: Props) {
  const { notify } = useToast();
  const [type, setType] = useState<TransactionType>('credit');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState(() => generateReference('TXN'));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Synchronous guard: blocks a second submit even before React re-renders the disabled button.
  const inFlight = useRef(false);

  function validate(): FieldErrors {
    const result: FieldErrors = {};
    const amountError = validateAmount(amount);
    if (amountError) result.amount = amountError;
    const referenceError = validateReference(reference);
    if (referenceError) result.reference_id = referenceError;
    if (description.trim().length > DESCRIPTION_MAX) {
      result.description = `Description must be at most ${DESCRIPTION_MAX} characters.`;
    }
    return result;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    setFormError(null);
    const clientErrors = validate();
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    inFlight.current = true;
    setSubmitting(true);
    try {
      const result = await transactionsApi.create(accountId, {
        type,
        amount: normalizeAmount(amount),
        description: description.trim(),
        reference_id: reference.trim(),
      });
      notify(
        'success',
        `${type === 'credit' ? 'Credit' : 'Debit'} of ${formatMoney(result.transaction.amount)} recorded`,
        `New balance: ${formatMoney(result.account.balance)}`,
      );
      setAmount('');
      setDescription('');
      setReference(generateReference('TXN'));
      setErrors({});
      onSuccess();
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === 'INSUFFICIENT_BALANCE') {
        setFormError(`Insufficient balance. This debit exceeds the available balance of ${formatMoney(balance)}.`);
      } else if (apiError.code === 'DUPLICATE_TRANSACTION') {
        setErrors({ reference_id: 'This reference ID has already been used for this account.' });
      } else {
        setErrors(apiError.fieldErrors());
        setFormError(apiError.message);
      }
      notify('error', 'Transaction failed', apiError.message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const exceedsBalance =
    type === 'debit' && validateAmount(amount) === null && toCents(amount.trim()) > toCents(balance);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">Transaction type</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {(['credit', 'debit'] as const).map((option) => {
            const selected = type === option;
            const color =
              option === 'credit'
                ? selected
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500'
                  : 'border-slate-300 text-slate-600 hover:border-emerald-300'
                : selected
                  ? 'border-rose-500 bg-rose-50 text-rose-800 ring-1 ring-rose-500'
                  : 'border-slate-300 text-slate-600 hover:border-rose-300';
            return (
              <label
                key={option}
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-400 ${color}`}
              >
                <input
                  type="radio"
                  name="transaction-type"
                  value={option}
                  checked={selected}
                  onChange={() => setType(option)}
                  disabled={submitting}
                  className="sr-only"
                />
                <span aria-hidden="true">{option === 'credit' ? '↓' : '↑'}</span>
                {option === 'credit' ? 'Credit (deposit)' : 'Debit (withdraw)'}
              </label>
            );
          })}
        </div>
      </fieldset>

      <TextField
        label="Amount"
        name="amount"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        disabled={submitting}
        required
        error={errors.amount}
        hint={exceedsBalance ? `Exceeds the available balance of ${formatMoney(balance)}.` : 'Up to 2 decimal places.'}
      />
      <TextField
        label="Description"
        name="description"
        placeholder="Optional"
        maxLength={DESCRIPTION_MAX}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        disabled={submitting}
        error={errors.description}
      />
      <TextField
        label="Reference ID"
        name="reference_id"
        value={reference}
        onChange={(event) => setReference(event.target.value)}
        disabled={submitting}
        required
        error={errors.reference_id}
        hint="Unique per account. Re-using a reference is rejected, so retries never double-post."
      />

      {formError && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {formError}
        </p>
      )}

      <Button type="submit" variant={type} loading={submitting} className="w-full">
        {submitting ? 'Processing…' : type === 'credit' ? 'Credit account' : 'Debit account'}
      </Button>
    </form>
  );
}
