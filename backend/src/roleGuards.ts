import type { ParticipantRole } from '@prisma/client';

export type PermissionAction =
  | 'DRAW'
  | 'EDIT_OBJECT'
  | 'DELETE_ANY_OBJECT'
  | 'DELETE_OWN_OBJECT'
  | 'COMMENT'
  | 'INVITE'
  | 'CHANGE_ROLES'
  | 'CREATE_VERSION'
  | 'RESTORE_VERSION'
  | 'GENERATE_AI_SUMMARY'
  | 'EXPORT_BOARD'
  | 'REPLAY_BOARD'
  | 'DELETE_ROOM'
  | 'UPDATE_ROOM_SETTINGS';

const ownerActions: PermissionAction[] = [
  'DRAW',
  'EDIT_OBJECT',
  'DELETE_ANY_OBJECT',
  'DELETE_OWN_OBJECT',
  'COMMENT',
  'INVITE',
  'CHANGE_ROLES',
  'CREATE_VERSION',
  'RESTORE_VERSION',
  'GENERATE_AI_SUMMARY',
  'EXPORT_BOARD',
  'REPLAY_BOARD',
  'DELETE_ROOM',
  'UPDATE_ROOM_SETTINGS',
];

const editorActions: PermissionAction[] = [
  'DRAW',
  'EDIT_OBJECT',
  'DELETE_OWN_OBJECT',
  'COMMENT',
  'CREATE_VERSION',
  'GENERATE_AI_SUMMARY',
  'EXPORT_BOARD',
  'REPLAY_BOARD',
];
const viewerActions: PermissionAction[] = [];

export const canRole = (role: ParticipantRole | null | undefined, action: PermissionAction) => {
  if (role === 'OWNER') return ownerActions.includes(action);
  if (role === 'EDITOR') return editorActions.includes(action);
  if (role === 'VIEWER') return viewerActions.includes(action);
  return false;
};

export const toSocketRole = (role: ParticipantRole) => role.toLowerCase() as 'owner' | 'editor' | 'viewer';

export const toDbRole = (role: string | undefined): ParticipantRole => {
  if (role === 'OWNER' || role === 'EDITOR' || role === 'VIEWER') return role;
  if (role === 'owner') return 'OWNER';
  if (role === 'viewer') return 'VIEWER';
  return 'EDITOR';
};
