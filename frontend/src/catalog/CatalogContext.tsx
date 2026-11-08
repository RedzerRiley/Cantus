import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { languagesApi, tagsApi } from '../api/endpoints';
import type { Language, Tag } from '../api/types';
import { isAbortError } from '../api/errors';

interface CatalogContextValue {
  languages: Language[];
  tags: Tag[];
  loading: boolean;
  error: unknown;
  reload: () => void;
  /** Insert/replace a tag locally (e.g. after inline creation). */
  upsertTag: (tag: Tag) => void;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** Languages and tags are small, workspace-wide lists used on most screens; load once and share. */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    Promise.all([languagesApi.list(controller.signal), tagsApi.list(controller.signal)])
      .then(([langs, tagList]) => {
        setLanguages([...langs].sort(byName));
        setTags([...tagList].sort(byName));
      })
      .catch((err: unknown) => {
        if (!isAbortError(err)) setError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const upsertTag = useCallback((tag: Tag) => {
    setTags((prev) => [...prev.filter((t) => t.id !== tag.id), tag].sort(byName));
  }, []);

  const value = useMemo(() => ({ languages, tags, loading, error, reload, upsertTag }), [languages, tags, loading, error, reload, upsertTag]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used inside <CatalogProvider>');
  return ctx;
}
