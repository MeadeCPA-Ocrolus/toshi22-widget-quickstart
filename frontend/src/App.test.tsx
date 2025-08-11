import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Tax Document Manager heading', () => {
  render(<App />);
  const heading = screen.getByText(/Tax Document Manager/i);
  expect(heading).toBeInTheDocument();
});

test('renders book selection section', () => {
  render(<App />);
  const bookSelection = screen.getByText(/Book Selection/i);
  expect(bookSelection).toBeInTheDocument();
});

test('renders document upload section', () => {
  render(<App />);
  const documentUpload = screen.getByText(/Document Upload/i);
  expect(documentUpload).toBeInTheDocument();
});

test('renders recent activity section', () => {
  render(<App />);
  const recentActivity = screen.getByText(/Recent Activity/i);
  expect(recentActivity).toBeInTheDocument();
});
