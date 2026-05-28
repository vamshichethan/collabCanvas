import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BoardCard from '../BoardCard';
import type { DashboardBoard } from '../../types';

const viewerBoard: DashboardBoard = {
  id: 'board_1',
  roomId: 'room_1',
  title: 'Read Only',
  roomTitle: 'Read Only',
  status: 'ACTIVE',
  roomStatus: 'ACTIVE',
  role: 'VIEWER',
  visibility: 'PRIVATE',
  inviteCode: 'ABC123',
  inviteEnabled: false,
  inviteRole: 'VIEWER',
  ownerId: 'owner',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastActiveAt: new Date().toISOString(),
  lastSequenceNumber: 0,
  activeParticipantCount: 1,
  pinned: false,
  isOwner: false,
  isShared: true,
  isPublic: false,
};

describe('permission UI', () => {
  it('hides owner management actions for viewers', () => {
    render(
      <BoardCard
        board={viewerBoard}
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

    expect(screen.queryByLabelText('Invite')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Delete')).not.toBeInTheDocument();
  });
});
