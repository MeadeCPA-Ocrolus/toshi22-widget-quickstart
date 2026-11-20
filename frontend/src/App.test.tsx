import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

// With nobody signed in (the sign-in check answers "no"), the app shows the
// sign-in screen and none of the staff pages.
beforeEach(() => {
  (global as any).fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('shows a loading message while it checks who is signed in', () => {
  render(<App />);
  expect(screen.getByText(/Loading/i)).toBeInTheDocument();
});

test('shows the sign-in screen when nobody is signed in', async () => {
  render(<App />);
  await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
});
