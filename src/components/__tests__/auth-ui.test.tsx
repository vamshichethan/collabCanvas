import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EmptyState from '../EmptyState';

describe('auth and empty states', () => {
  it('renders reusable empty-state action copy', () => {
    render(<EmptyState title="No boards found" message="Create one to start." actionLabel="Create board" onAction={() => {}} />);

    expect(screen.getByText('No boards found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create board' })).toBeInTheDocument();
  });
});
