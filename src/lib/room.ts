export const createRoomId = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export const getRoomIdFromPath = () => {
  const match = window.location.pathname.match(/^\/room\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

export const navigateToRoom = (roomId: string) => {
  window.history.pushState({}, '', `/room/${encodeURIComponent(roomId)}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
};
