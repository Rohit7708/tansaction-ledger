const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export const formatDateTime = (iso: string): string => dateTimeFormatter.format(new Date(iso));
export const formatDate = (iso: string): string => dateFormatter.format(new Date(iso));

/** Suggests a unique, human-readable idempotency key such as "TXN-20261028-4F7A2C". */
export function generateReference(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase();
  return `${prefix}-${date}-${random}`;
}

export const REFERENCE_PATTERN = /^[A-Za-z0-9._:/-]+$/;

export function validateReference(raw: string): string | null {
  const value = raw.trim();
  if (value === '') {
    return 'Reference ID is required.';
  }
  if (value.length > 100) {
    return 'Reference ID must be at most 100 characters.';
  }
  if (!REFERENCE_PATTERN.test(value)) {
    return 'Use only letters, digits and . _ : / -';
  }
  return null;
}
