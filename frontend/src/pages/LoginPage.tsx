import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Link, useNavigate, useSearchParams } from '../router';
import { FormErrors, FormField } from '../components/FormField';
import { Button } from '../components/ui';
import { ApiError, errorMessage } from '../api/errors';
import { safeNextPath } from '../lib/routeMatch';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  useDocumentTitle('Sign in');
  const { login } = useAuth();
  const navigate = useNavigate();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const local: Record<string, string[]> = {};
    if (!username.trim()) local.username = ['Enter your username.'];
    if (!password) local.password = ['Enter your password.'];
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await login({ username: username.trim(), password });
      navigate(safeNextPath(params.get('next')), { replace: true, force: true });
    } catch (err) {
      setErrors(err instanceof ApiError && Object.keys(err.fieldErrors).length ? err.fieldErrors : { non_field_errors: [errorMessage(err)] });
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Your parish songbook and lineups, ready for Mass."
      footer={
        <p>
          New to Cantus? <Link to="/register">Create a workspace for your choir</Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="form-stack">
        <FormErrors messages={errors.non_field_errors ?? errors.detail} />
        <FormField id="login-username" label="Username" error={errors.username?.[0]} required>
          {(p) => <input {...p} className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />}
        </FormField>
        <FormField id="login-password" label="Password" error={errors.password?.[0]} required>
          {(p) => <input {...p} type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </FormField>
        <Button type="submit" variant="primary" size="lg" busy={busy} className="btn--block">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
