import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BoardCard from '../BoardCard';
import type { DashboardBoard } from '../../types';

const board: DashboardBoard = {
  id: 'board_1',
  roomId: 'room_1',
  title: 'Planning Board',
  roomTitle: 'Planning Board',
  description: 'Roadmap work',
  status: 'ACTIVE',
  roomStatus: 'ACTIVE',
  role: 'OWNER',
  visibility: 'PRIVATE',
  inviteCode: 'ABC123',
  inviteEnabled: true,
  inviteRole: 'VIEWER',
  ownerId: 'user_1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastActiveAt: new Date().toISOString(),
  lastSequenceNumber: 12,
  activeParticipantCount: 3,
  pinned: false,
  isOwner: true,
  isShared: false,
  isPublic: false,
};

describe('dashboard board card', () => {
  it('shows lifecycle metadata and owner actions', () => {
    render(
      <BoardCard
        board={board}
        onOpen={() => {}}
        onRename={() => {}}
        onDuplicate={() => {}}
        onArchive={() => {}}
        onRestore={() => {}}
        onDelete={() => {}}
        onPin={() => {}}
        onInvite={() => {}}
      />,
    );

    expect(screen.getByText('Planning Board')).toBeInTheDocument();
    expect(screen.getByText('OWNER')).toBeInTheDocument();
    expect(screen.getByLabelText('Invite')).toBeInTheDocument();
  });
});
