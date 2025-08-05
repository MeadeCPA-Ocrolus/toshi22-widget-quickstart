import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders book selection heading', () => {
  render(<App />);
  const heading = screen.getByText(/Choose an existing book or create a new one/i);
  expect(heading).toBeInTheDocument();
});