import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Toolbar from '../Toolbar';

describe('toolbar', () => {
  it('disables drawing controls in read-only mode', () => {
    render(
      <Toolbar
        activeTool="select"
        settings={{ color: '#2563eb', strokeWidth: 4 }}
        disabled
        onToolChange={() => {}}
        onSettingsChange={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: /pen/i })).toBeDisabled();
  });
});
