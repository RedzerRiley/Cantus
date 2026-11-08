import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Link, RouterProvider, Routes, useBlocker, useParams } from './router';

function Lineup() {
  const { id } = useParams();
  return <h1>Lineup {id}</h1>;
}

function Dirty() {
  useBlocker(true, 'Unsaved!');
  return <h1>Editing</h1>;
}

const routes = [
  { path: '/', value: () => <h1>Home</h1> },
  { path: '/edit', value: () => <Dirty /> },
  { path: '/lineups/:id', value: () => <Lineup /> },
];

function App({ confirm }: { confirm?: (m: string) => boolean }) {
  return (
    <RouterProvider confirm={confirm}>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/lineups/5">Five</Link>
        <Link to="/edit">Edit</Link>
        <Link to="/missing">Missing</Link>
      </nav>
      <Routes routes={routes} fallback={<h1>Not found</h1>} />
    </RouterProvider>
  );
}

describe('router', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));

  it('navigates via Link and matches params', () => {
    render(<App />);
    expect(screen.getByRole('heading')).toHaveTextContent('Home');
    fireEvent.click(screen.getByRole('link', { name: 'Five' }));
    expect(screen.getByRole('heading')).toHaveTextContent('Lineup 5');
    expect(window.location.pathname).toBe('/lineups/5');
  });

  it('renders the fallback for unknown paths', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: 'Missing' }));
    expect(screen.getByRole('heading')).toHaveTextContent('Not found');
  });

  it('blocks navigation when a blocker is active and the user cancels', () => {
    const confirm = vi.fn(() => false);
    render(<App confirm={confirm} />);
    fireEvent.click(screen.getByRole('link', { name: 'Edit' }));
    expect(screen.getByRole('heading')).toHaveTextContent('Editing');
    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    expect(confirm).toHaveBeenCalledWith('Unsaved!');
    expect(screen.getByRole('heading')).toHaveTextContent('Editing');
  });

  it('allows navigation when the user confirms', () => {
    render(<App confirm={() => true} />);
    fireEvent.click(screen.getByRole('link', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    expect(screen.getByRole('heading')).toHaveTextContent('Home');
  });
});
