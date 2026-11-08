import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Link, useNavigate } from '../router';
import { FormErrors, FormField } from '../components/FormField';
import { Button } from '../components/ui';
import { ApiError, errorMessage } from '../api/errors';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { AuthLayout } from './AuthLayout';

export function RegisterPage() {
  useDocumentTitle('Create workspace');
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ workspace_name: '', username: '', password: '', first_name: '', last_name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const local: Record<string, string[]> = {};
    if (!form.workspace_name.trim()) local.workspace_name = ['Enter your parish or choir name.'];
    if (!form.username.trim()) local.username = ['Choose a username.'];
    if (form.password.length < 8) local.password = ['Use at least 8 characters.'];
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await register({
        workspace_name: form.workspace_name.trim(),
        username: form.username.trim(),
        password: form.password,
        first_name: form.first_name.trim() || undefined,
        last_name: form.last_name.trim() || undefined,
        email: form.email.trim() || undefined,
      });
      navigate('/', { replace: true, force: true });
    } catch (err) {
      setErrors(err instanceof ApiError && Object.keys(err.fieldErrors).length ? err.fieldErrors : { non_field_errors: [errorMessage(err)] });
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your choir’s workspace"
      subtitle="You’ll be the admin and can add other members later."
      footer={
        <p>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="form-stack">
        <FormErrors messages={errors.non_field_errors ?? errors.detail} />
        <FormField id="reg-workspace" label="Parish or choir name" hint="e.g. St. Joseph Parish Choir" error={errors.workspace_name?.[0]} required>
          {(p) => <input {...p} className="input" autoComplete="organization" value={form.workspace_name} onChange={set('workspace_name')} />}
        </FormField>
        <div className="form-grid-2">
          <FormField id="reg-first" label="First name" error={errors.first_name?.[0]}>
            {(p) => <input {...p} className="input" autoComplete="given-name" value={form.first_name} onChange={set('first_name')} />}
          </FormField>
          <FormField id="reg-last" label="Last name" error={errors.last_name?.[0]}>
            {(p) => <input {...p} className="input" autoComplete="family-name" value={form.last_name} onChange={set('last_name')} />}
          </FormField>
        </div>
        <FormField id="reg-email" label="Email (optional)" error={errors.email?.[0]}>
          {(p) => <input {...p} type="email" className="input" autoComplete="email" value={form.email} onChange={set('email')} />}
        </FormField>
        <FormField id="reg-username" label="Username" error={errors.username?.[0]} required>
          {(p) => <input {...p} className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} value={form.username} onChange={set('username')} />}
        </FormField>
        <FormField id="reg-password" label="Password" hint="At least 8 characters." error={errors.password?.[0]} required>
          {(p) => <input {...p} type="password" className="input" autoComplete="new-password" value={form.password} onChange={set('password')} />}
        </FormField>
        <Button type="submit" variant="primary" size="lg" busy={busy} className="btn--block">
          {busy ? 'Creating…' : 'Create workspace'}
        </Button>
      </form>
    </AuthLayout>
  );
}
