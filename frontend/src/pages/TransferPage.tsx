import { type FormEvent, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button, Card, EmptyState, ErrorState, SelectField, Skeleton, TextField } from '../components/ui';
import { useAccounts } from '../hooks/useAccounts';
import { useToast } from '../hooks/useToast';
import { generateReference, validateReference } from '../lib/format';
import { formatMoney, normalizeAmount, validateAmount } from '../lib/money';
import { toApiError } from '../services/http';
import { transfersApi } from '../services/transfers';
import type { CreateTransferResult } from '../types/api';

type Field = 'from_account_id' | 'to_account_id' | 'amount' | 'reference_id' | 'description';
type FieldErrors = Partial<Record<Field, string>>;

export function TransferPage() {
  const { notify } = useToast();
  const accounts = useAccounts();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState(() => generateReference('TRF'));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateTransferResult | null>(null);
  const inFlight = useRef(false);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!fromId) next.from_account_id = 'Choose a source account.';
    if (!toId) next.to_account_id = 'Choose a destination account.';
    if (fromId && toId && fromId === toId) next.to_account_id = 'Destination must differ from the source.';
    const amountError = validateAmount(amount);
    if (amountError) next.amount = amountError;
    const referenceError = validateReference(reference);
    if (referenceError) next.reference_id = referenceError;
    if (description.trim().length > 255) next.description = 'Description must be at most 255 characters.';
    return next;
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
      const transfer = await transfersApi.create({
        from_account_id: fromId,
        to_account_id: toId,
        amount: normalizeAmount(amount),
        reference_id: reference.trim(),
        description: description.trim(),
      });
      setResult(transfer);
      notify('success', 'Transfer completed', `${formatMoney(transfer.transfer.amount)} moved successfully.`);
      setAmount('');
      setDescription('');
      setReference(generateReference('TRF'));
      setErrors({});
      accounts.reload();
    } catch (error) {
      const apiError = toApiError(error);
      setResult(null);
      switch (apiError.code) {
        case 'INSUFFICIENT_BALANCE':
          setFormError('Insufficient balance in the source account. No money was moved.');
          break;
        case 'DUPLICATE_TRANSFER':
          setErrors({ reference_id: 'A transfer with this reference ID was already processed.' });
          break;
        case 'SOURCE_ACCOUNT_NOT_FOUND':
          setErrors({ from_account_id: apiError.message });
          break;
        case 'DESTINATION_ACCOUNT_NOT_FOUND':
          setErrors({ to_account_id: apiError.message });
          break;
        default:
          setErrors(apiError.fieldErrors());
          setFormError(apiError.message);
      }
      notify('error', 'Transfer failed', apiError.message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const list = accounts.data;
  const nameOf = (id: string) => list?.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/" className="text-sm text-teal-700 hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Transfer money</h1>
        <p className="mt-1 text-sm text-slate-500">
          Debits the source and credits the destination in a single atomic operation.
        </p>
      </div>

      {result && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          <p className="font-semibold">
            Transferred {formatMoney(result.transfer.amount)} (ref {result.transfer.reference_id})
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-emerald-700">{result.from_account.name} — new balance</dt>
              <dd className="tabular text-lg font-semibold">{formatMoney(result.from_account.balance)}</dd>
            </div>
            <div>
              <dt className="text-emerald-700">{result.to_account.name} — new balance</dt>
              <dd className="tabular text-lg font-semibold">{formatMoney(result.to_account.balance)}</dd>
            </div>
          </dl>
        </div>
      )}

      <Card>
        {accounts.error && !list ? (
          <ErrorState message={accounts.error.message} onRetry={accounts.reload} />
        ) : !list ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : list.length < 2 ? (
          <EmptyState
            title="At least two accounts are needed"
            description="Create another account to transfer money between accounts."
            action={
              <Link to="/accounts/new" className="text-sm font-medium text-teal-700 hover:underline">
                Create account
              </Link>
            }
          />
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="From account"
                value={fromId}
                onChange={setFromId}
                disabled={submitting}
                error={errors.from_account_id}
              >
                <option value="">Select source…</option>
                {list.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({formatMoney(account.balance)})
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="To account"
                value={toId}
                onChange={setToId}
                disabled={submitting}
                error={errors.to_account_id}
              >
                <option value="">Select destination…</option>
                {list.map((account) => (
                  <option key={account.id} value={account.id} disabled={account.id === fromId}>
                    {account.name} ({formatMoney(account.balance)})
                  </option>
                ))}
              </SelectField>
            </div>
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
            />
            <TextField
              label="Description"
              name="description"
              placeholder="Optional"
              maxLength={255}
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
              hint="Idempotency key: a transfer reference is processed at most once."
            />
            {formError && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                {formError}
              </p>
            )}
            <Button type="submit" loading={submitting} className="w-full">
              {submitting
                ? 'Transferring…'
                : fromId && toId
                  ? `Transfer from ${nameOf(fromId)} to ${nameOf(toId)}`
                  : 'Transfer'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
