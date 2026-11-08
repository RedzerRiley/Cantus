import { Link } from '../router';
import { PageHeader } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Not found');
  return (
    <>
      <PageHeader title="Page not found" subtitle="That page doesn’t exist, or it may have been deleted." />
      <p>
        <Link to="/" className="btn btn--primary">
          Go to Home
        </Link>
      </p>
    </>
  );
}
