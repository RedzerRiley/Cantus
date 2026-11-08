import { describe, expect, it } from 'vitest';
import { matchPath, matchRoutes, safeNextPath, shareTokenFromLocation } from './routeMatch';

describe('matchPath', () => {
  it('matches static paths, ignoring trailing slashes', () => {
    expect(matchPath('/', '/')).toEqual({});
    expect(matchPath('/songs', '/songs/')).toEqual({});
    expect(matchPath('/songs', '/Songs')).toEqual({});
    expect(matchPath('/songs', '/lineups')).toBeNull();
  });
  it('captures params', () => {
    expect(matchPath('/lineups/:id', '/lineups/42')).toEqual({ id: '42' });
    expect(matchPath('/a/:x/b/:y', '/a/1/b/hello%20world')).toEqual({ x: '1', y: 'hello world' });
  });
  it('requires the same number of segments', () => {
    expect(matchPath('/lineups/:id', '/lineups')).toBeNull();
    expect(matchPath('/lineups/:id', '/lineups/1/extra')).toBeNull();
    expect(matchPath('/', '/songs')).toBeNull();
  });
  it('supports a trailing wildcard', () => {
    expect(matchPath('/files/*', '/files/a/b')).toEqual({ '*': 'a/b' });
  });
  it('ignores query and hash', () => {
    expect(matchPath('/songs', '/songs?new=1')).toEqual({});
  });
});

describe('matchRoutes', () => {
  const routes = [
    { path: '/lineups/new', value: 'new' },
    { path: '/lineups/:id', value: 'edit' },
  ];
  it('returns the first match in order', () => {
    expect(matchRoutes(routes, '/lineups/new')?.route.value).toBe('new');
    expect(matchRoutes(routes, '/lineups/7')).toEqual({ route: routes[1], params: { id: '7' } });
    expect(matchRoutes(routes, '/nope')).toBeNull();
  });
});

describe('safeNextPath', () => {
  it('only allows same-origin relative paths', () => {
    expect(safeNextPath('/lineups/3')).toBe('/lineups/3');
    expect(safeNextPath('//evil.com')).toBe('/');
    expect(safeNextPath('https://evil.com')).toBe('/');
    expect(safeNextPath('/\\evil.com')).toBe('/');
    expect(safeNextPath(null)).toBe('/');
  });
});

describe('shareTokenFromLocation', () => {
  it('reads the pretty /share/<token> form', () => {
    expect(shareTokenFromLocation('/share/abc_DEF-123', '')).toBe('abc_DEF-123');
  });

  it('reads the /?share=<token> form that needs no server rewrite', () => {
    expect(shareTokenFromLocation('/', '?share=abc_DEF-123')).toBe('abc_DEF-123');
    expect(shareTokenFromLocation('/', '?x=1&share=tok')).toBe('tok');
  });

  it('ignores everything else', () => {
    expect(shareTokenFromLocation('/', '')).toBeNull();
    expect(shareTokenFromLocation('/', '?share=')).toBeNull();
    expect(shareTokenFromLocation('/', '?share=%20')).toBeNull();
    expect(shareTokenFromLocation('/lineups/3', '?share=tok')).toBeNull();
    expect(shareTokenFromLocation('/share', '')).toBeNull();
  });
});
