import { type FormEvent, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Card, TextField } from '../components/ui';
import { useToast } from '../hooks/useToast';
import { accountsApi } from '../services/accounts';
import { toApiError } from '../services/http';

const NAME_MAX = 100;

export function CreateAccountPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Account name is required.');
      return;
    }
    if (trimmed.length > NAME_MAX) {
      setError(`Account name must be at most ${NAME_MAX} characters.`);
      return;
    }

    setError(undefined);
    inFlight.current = true;
    setSubmitting(true);
    try {
      const account = await accountsApi.create(trimmed);
      notify('success', 'Account created', `${account.name} is ready with a balance of 0.00.`);
      navigate(`/accounts/${account.id}`);
    } catch (err) {
      const apiError = toApiError(err);
      setError(apiError.fieldErrors().name ?? apiError.message);
      notify('error', 'Could not create account', apiError.message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link to="/" className="text-sm text-teal-700 hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Create account</h1>
        <p className="mt-1 text-sm text-slate-500">New accounts always start with a balance of 0.00.</p>
      </div>
      <Card>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <TextField
            label="Account name"
            name="name"
            autoFocus
            autoComplete="off"
            placeholder="e.g. John Doe"
            maxLength={NAME_MAX}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={submitting}
            required
            error={error}
          />
          <Button type="submit" loading={submitting} className="w-full">
            {submitting ? 'Creating…' : 'Create account'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
