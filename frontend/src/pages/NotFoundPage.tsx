import { Link } from 'react-router';
import { EmptyState } from '../components/ui';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you are looking for does not exist."
      action={
        <Link to="/" className="text-sm font-medium text-teal-700 hover:underline">
          Go to dashboard
        </Link>
      }
    />
  );
}
