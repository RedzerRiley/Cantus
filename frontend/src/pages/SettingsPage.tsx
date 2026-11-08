import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import type { ID, Language, Member, Role, Tag } from '../api/types';
import { authApi, languagesApi, tagsApi, workspaceApi, type CatalogKind } from '../api/endpoints';
import { ApiError, errorMessage } from '../api/errors';
import { useAuth, useMe } from '../auth/AuthContext';
import { useCatalog } from '../catalog/CatalogContext';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button, ErrorBanner, LoadingBlock, PageHeader } from '../components/ui';
import { FormErrors, FormField } from '../components/FormField';
import { LanguageSelect } from '../components/LanguageSelect';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { IconEdit, IconLogout, IconPlus, IconTrash } from '../components/icons';
import { displayName, formatRelativeTime, pluralize } from '../lib/format';

type Errors = Record<string, string[]>;
const toErrors = (err: unknown): Errors =>
  err instanceof ApiError && Object.keys(err.fieldErrors).length ? err.fieldErrors : { non_field_errors: [errorMessage(err)] };

export function SettingsPage() {
  useDocumentTitle('Settings');
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  return (
    <>
      <PageHeader title="Settings" />
      <nav aria-label="Settings sections" className="settings-toc">
        <ul className="plain-list chip-row">
          {[
            ['parish', 'Parish'],
            ['profile', 'Profile'],
            ['password', 'Password'],
            ['languages', 'Languages'],
            ['tags', 'Tags'],
            ['members', 'Members'],
          ].map(([id, label]) => (
            <li key={id}>
              <a className="chip chip--link" href={`#${id}`} onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(id as string);
                el?.scrollIntoView({ block: 'start' });
                el?.querySelector<HTMLElement>('h2')?.focus();
              }}>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="settings-grid">
        <WorkspaceSection />
        <ProfileSection />
        <PasswordSection />
        <CatalogSection kind="languages" />
        <CatalogSection kind="tags" />
        <MembersSection />
        <section className="card settings-card" aria-labelledby="logout-h">
          <h2 id="logout-h" className="section__title" tabIndex={-1}>
            Sign out
          </h2>
          <p className="muted">Sign out of Cantus on this device.</p>
          <Button
            variant="secondary"
            icon={<IconLogout size={18} />}
            busy={loggingOut}
            onClick={() => {
              setLoggingOut(true);
              void logout();
            }}
          >
            Log out
          </Button>
        </section>
      </div>
    </>
  );
}

function SectionCard({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="card settings-card" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="section__title" tabIndex={-1}>
        {title}
      </h2>
      {description && <p className="muted small">{description}</p>}
      {children}
    </section>
  );
}

function WorkspaceSection() {
  const me = useMe();
  const { setMe, isAdmin } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(me.workspace.name);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrors({ name: ['Enter a name.'] });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const ws = await workspaceApi.update(name.trim());
      setMe({ ...me, workspace: { id: ws.id, name: ws.name } });
      setName(ws.name);
      toast.success('Parish name updated');
    } catch (err) {
      setErrors(toErrors(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard id="parish" title="Parish / group" description={isAdmin ? 'Shown to everyone in your group.' : 'Only admins can change the group name.'}>
      {isAdmin ? (
        <form onSubmit={onSubmit} noValidate className="form-stack">
          <FormErrors messages={errors.non_field_errors ?? errors.detail} />
          <FormField id="ws-name" label="Parish or choir name" error={errors.name?.[0]} required>
            {(p) => <input {...p} className="input" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />}
          </FormField>
          <div>
            <Button type="submit" variant="primary" busy={busy} disabled={name.trim() === me.workspace.name}>
              Save name
            </Button>
          </div>
        </form>
      ) : (
        <p className="readonly-value">{me.workspace.name}</p>
      )}
    </SectionCard>
  );
}

function ProfileSection() {
  const me = useMe();
  const { setMe } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ first_name: me.first_name, last_name: me.last_name, email: me.email, preferred_language: me.preferred_language });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const dirty =
    form.first_name !== me.first_name || form.last_name !== me.last_name || form.email !== me.email || form.preferred_language !== me.preferred_language;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const updated = await authApi.updateMe({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        preferred_language: form.preferred_language,
      });
      setMe(updated);
      toast.success('Profile saved');
    } catch (err) {
      setErrors(toErrors(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard id="profile" title="Your profile" description={`Signed in as ${me.username} (${me.role === 'admin' ? 'admin' : 'member'}).`}>
      <form onSubmit={onSubmit} noValidate className="form-stack">
        <FormErrors messages={errors.non_field_errors ?? errors.detail} />
        <div className="form-grid-2">
          <FormField id="pf-first" label="First name" error={errors.first_name?.[0]}>
            {(p) => <input {...p} className="input" autoComplete="given-name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />}
          </FormField>
          <FormField id="pf-last" label="Last name" error={errors.last_name?.[0]}>
            {(p) => <input {...p} className="input" autoComplete="family-name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />}
          </FormField>
        </div>
        <FormField id="pf-email" label="Email" error={errors.email?.[0]}>
          {(p) => <input {...p} type="email" className="input" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        </FormField>
        <FormField id="pf-lang" label="Preferred language" error={errors.preferred_language?.[0]} hint="Used as the default language for new songs and new lineups.">
          {(p) => <LanguageSelect {...p} value={form.preferred_language} onChange={(v) => setForm({ ...form, preferred_language: v })} emptyLabel="No preference" />}
        </FormField>
        <div>
          <Button type="submit" variant="primary" busy={busy} disabled={!dirty}>
            Save profile
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function PasswordSection() {
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const local: Errors = {};
    if (!form.current) local.current_password = ['Enter your current password.'];
    if (form.next.length < 8) local.new_password = ['Use at least 8 characters.'];
    else if (form.next !== form.confirm) local.confirm = ['The new passwords don’t match.'];
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await authApi.changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      toast.success('Password changed');
    } catch (err) {
      setErrors(toErrors(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard id="password" title="Change password">
      <form onSubmit={onSubmit} noValidate className="form-stack">
        <FormErrors messages={errors.non_field_errors ?? errors.detail} />
        <FormField id="pw-current" label="Current password" error={errors.current_password?.[0]} required>
          {(p) => <input {...p} type="password" className="input" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />}
        </FormField>
        <FormField id="pw-new" label="New password" hint="At least 8 characters." error={errors.new_password?.[0]} required>
          {(p) => <input {...p} type="password" className="input" autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />}
        </FormField>
        <FormField id="pw-confirm" label="Confirm new password" error={errors.confirm?.[0]} required>
          {(p) => <input {...p} type="password" className="input" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />}
        </FormField>
        <div>
          <Button type="submit" variant="primary" busy={busy}>
            Change password
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function CatalogSection({ kind }: { kind: CatalogKind }) {
  const catalog = useCatalog();
  const toast = useToast();
  const api = kind === 'languages' ? languagesApi : tagsApi;
  const items: (Language | Tag)[] = kind === 'languages' ? catalog.languages : catalog.tags;
  const singular = kind === 'languages' ? 'language' : 'tag';
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<ID | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState<Language | Tag | null>(null);
  const addId = useId();

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      await api.create(newName.trim());
      setNewName('');
      catalog.reload();
      toast.success(`Added ${singular} “${newName.trim()}”`);
    } catch (err) {
      setAddError(err instanceof ApiError ? (err.field('name') ?? err.message) : errorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (item: Language | Tag) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditError(null);
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (editingId === null || !editName.trim()) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await api.rename(editingId, editName.trim());
      setEditingId(null);
      catalog.reload();
      toast.success('Renamed');
    } catch (err) {
      setEditError(err instanceof ApiError ? (err.field('name') ?? err.message) : errorMessage(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    await api.remove(deleting.id);
    const name = deleting.name;
    setDeleting(null);
    catalog.reload();
    toast.success(`Deleted ${singular} “${name}”`);
  };

  return (
    <SectionCard
      id={kind}
      title={kind === 'languages' ? 'Languages' : 'Tags'}
      description={kind === 'languages' ? 'Languages your choir sings in (e.g. Tagalog, English, Taglish, Latin).' : 'Tags help you find songs and lineups — parts of the Mass, seasons, occasions.'}
    >
      {catalog.error ? <ErrorBanner error={catalog.error} onRetry={catalog.reload} /> : null}
      {catalog.loading && items.length === 0 ? (
        <LoadingBlock lines={3} />
      ) : items.length === 0 ? (
        <p className="muted">No {kind} yet.</p>
      ) : (
        <ul className="manage-list">
          {items.map((item) => (
            <li key={item.id} className="manage-list__item">
              {editingId === item.id ? (
                <form className="manage-list__edit" onSubmit={saveEdit} noValidate>
                  <label htmlFor={`edit-${kind}-${item.id}`} className="visually-hidden">
                    New name for {item.name}
                  </label>
                  <input
                    id={`edit-${kind}-${item.id}`}
                    className="input input--sm"
                    value={editName}
                    maxLength={60}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingId(null);
                      }
                    }}
                    aria-invalid={editError ? true : undefined}
                    aria-describedby={editError ? `edit-${kind}-err` : undefined}
                  />
                  <Button type="submit" size="sm" variant="primary" busy={savingEdit}>
                    Save
                  </Button>
                  <Button size="sm" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                  {editError && (
                    <p id={`edit-${kind}-err`} className="field-error" role="alert">
                      {editError}
                    </p>
                  )}
                </form>
              ) : (
                <>
                  <span className="manage-list__name">{item.name}</span>
                  <span className="manage-list__count small muted">{pluralize(item.song_count, 'song')}</span>
                  <span className="manage-list__actions">
                    <button type="button" className="icon-btn" onClick={() => startEdit(item)} aria-label={`Rename ${singular} “${item.name}”`}>
                      <IconEdit size={18} />
                    </button>
                    <button type="button" className="icon-btn" onClick={() => setDeleting(item)} aria-label={`Delete ${singular} “${item.name}”`}>
                      <IconTrash size={18} />
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="inline-add" onSubmit={add} noValidate>
        <label htmlFor={addId} className="field__label">
          Add a {singular}
        </label>
        <div className="inline-add__row">
          <input
            id={addId}
            className="input"
            value={newName}
            maxLength={60}
            placeholder={kind === 'languages' ? 'e.g. Cebuano' : 'e.g. Simbang Gabi'}
            onChange={(e) => setNewName(e.target.value)}
            aria-invalid={addError ? true : undefined}
            aria-describedby={addError ? `${addId}-err` : undefined}
          />
          <Button type="submit" icon={<IconPlus size={18} />} busy={adding} disabled={!newName.trim()}>
            Add
          </Button>
        </div>
        {addError && (
          <p id={`${addId}-err`} className="field-error" role="alert">
            {addError}
          </p>
        )}
      </form>

      <ConfirmDialog open={deleting !== null} title={`Delete ${singular}?`} confirmLabel={`Delete ${singular}`} danger onConfirm={confirmDelete} onCancel={() => setDeleting(null)}>
        {deleting && (
          <p>
            Delete “{deleting.name}”?{' '}
            {deleting.song_count > 0
              ? kind === 'languages'
                ? `${pluralize(deleting.song_count, 'song')} (and any lineups) using it will have no language set.`
                : `It will be removed from ${pluralize(deleting.song_count, 'song')} and any lineups that use it.`
              : 'No songs use it.'}
          </p>
        )}
      </ConfirmDialog>
    </SectionCard>
  );
}

function MembersSection() {
  const me = useMe();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { data: members, error, loading, reload, setData } = useAsync((signal) => workspaceApi.members(signal), []);
  const [form, setForm] = useState({ username: '', password: '', first_name: '', last_name: '', email: '', role: 'member' as Role });
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [removing, setRemoving] = useState<Member | null>(null);
  const [roleBusy, setRoleBusy] = useState<ID | null>(null);

  useEffect(() => {
    if (!showAdd) setErrors({});
  }, [showAdd]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const local: Errors = {};
    if (!form.username.trim()) local.username = ['Enter a username.'];
    if (form.password.length < 8) local.password = ['Use at least 8 characters.'];
    setErrors(local);
    if (Object.keys(local).length) return;
    setAdding(true);
    try {
      const m = await workspaceApi.addMember({
        username: form.username.trim(),
        password: form.password,
        first_name: form.first_name.trim() || undefined,
        last_name: form.last_name.trim() || undefined,
        email: form.email.trim() || undefined,
        role: form.role,
      });
      setData((prev) => [...(prev ?? []), m]);
      setForm({ username: '', password: '', first_name: '', last_name: '', email: '', role: 'member' });
      setShowAdd(false);
      toast.success(`Added ${displayName(m)}. Share the temporary password with them privately.`);
    } catch (err) {
      setErrors(toErrors(err));
    } finally {
      setAdding(false);
    }
  };

  const changeRole = async (m: Member, role: Role) => {
    setRoleBusy(m.id);
    try {
      const updated = await workspaceApi.setRole(m.id, role);
      setData((prev) => prev?.map((x) => (x.id === m.id ? updated : x)));
      toast.success(`${displayName(m)} is now ${role === 'admin' ? 'an admin' : 'a member'}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRoleBusy(null);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    await workspaceApi.removeMember(removing.id);
    const target = removing;
    setData((prev) => prev?.filter((x) => x.id !== target.id));
    setRemoving(null);
    toast.success(`Removed ${displayName(target)}`);
  };

  return (
    <SectionCard id="members" title="Members" description={isAdmin ? 'People who can use this workspace. Admins can rename the group and manage members.' : 'People in your group. Ask an admin to add or remove members.'}>
      <ErrorBanner error={error} onRetry={reload} />
      {loading && !members ? (
        <LoadingBlock lines={3} />
      ) : (
        <ul className="manage-list">
          {(members ?? []).map((m) => {
            const isSelf = m.id === me.id;
            return (
              <li key={m.id} className="manage-list__item manage-list__item--member">
                <span className="manage-list__name">
                  {displayName(m)} {isSelf && <span className="badge">You</span>}
                  <span className="small muted block">
                    @{m.username} · joined {formatRelativeTime(m.date_joined)}
                  </span>
                </span>
                {isAdmin && !isSelf ? (
                  <span className="manage-list__actions">
                    <label htmlFor={`role-${m.id}`} className="visually-hidden">
                      Role for {displayName(m)}
                    </label>
                    <select
                      id={`role-${m.id}`}
                      className="input input--sm"
                      value={m.role}
                      disabled={roleBusy === m.id}
                      onChange={(e) => void changeRole(m, e.target.value as Role)}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button type="button" className="icon-btn" onClick={() => setRemoving(m)} aria-label={`Remove ${displayName(m)}`}>
                      <IconTrash size={18} />
                    </button>
                  </span>
                ) : (
                  <span className="badge badge--role">{m.role === 'admin' ? 'Admin' : 'Member'}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isAdmin &&
        (showAdd ? (
          <form onSubmit={add} noValidate className="form-stack add-member">
            <h3 className="subsection-title">Add a member</h3>
            <FormErrors messages={errors.non_field_errors ?? errors.detail} />
            <div className="form-grid-2">
              <FormField id="m-first" label="First name" error={errors.first_name?.[0]}>
                {(p) => <input {...p} className="input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />}
              </FormField>
              <FormField id="m-last" label="Last name" error={errors.last_name?.[0]}>
                {(p) => <input {...p} className="input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />}
              </FormField>
            </div>
            <FormField id="m-username" label="Username" error={errors.username?.[0]} required>
              {(p) => <input {...p} className="input" autoCapitalize="none" spellCheck={false} autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />}
            </FormField>
            <FormField id="m-password" label="Temporary password" hint="At least 8 characters. Share it privately; they can change it in Settings." error={errors.password?.[0]} required>
              {(p) => <input {...p} type="text" className="input" autoComplete="new-password" spellCheck={false} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
            </FormField>
            <FormField id="m-email" label="Email (optional)" error={errors.email?.[0]}>
              {(p) => <input {...p} type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
            </FormField>
            <FormField id="m-role" label="Role" error={errors.role?.[0]}>
              {(p) => (
                <select {...p} className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                  <option value="member">Member — can manage songs and lineups</option>
                  <option value="admin">Admin — can also manage members and the group name</option>
                </select>
              )}
            </FormField>
            <div className="btn-row">
              <Button onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" variant="primary" busy={adding}>
                Add member
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <Button icon={<IconPlus size={18} />} onClick={() => setShowAdd(true)}>
              Add member
            </Button>
          </div>
        ))}

      <ConfirmDialog open={removing !== null} title="Remove member?" confirmLabel="Remove member" danger onConfirm={confirmRemove} onCancel={() => setRemoving(null)}>
        {removing && <p>This deletes {displayName(removing)}’s account (@{removing.username}). Songs and lineups stay in the workspace.</p>}
      </ConfirmDialog>
    </SectionCard>
  );
}
