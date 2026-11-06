export interface CameraPlayer {
  id: string;
  alive: boolean;
}

/**
 * Resolve the fighter the camera should follow without trusting stale UI
 * state. A living local fighter always owns their camera; spectating is only
 * valid while they are out, and must point at a living fighter.
 */
export function cameraFocusId(
  players: readonly CameraPlayer[],
  localId: string,
  requestedSpectateId: string | null,
): string | null {
  const local = players.find((player) => player.id === localId);
  if (local?.alive) return local.id;

  if (
    requestedSpectateId &&
    players.some((player) => player.id === requestedSpectateId && player.alive)
  )
    return requestedSpectateId;

  return players.find((player) => player.alive)?.id ?? local?.id ?? null;
}
