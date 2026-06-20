/** Trusted actor for activity events — set from AuthContext only, never from client payloads. */
let trustedActor = null;

export function setActivityActor(user) {
  if (!user?.id) {
    trustedActor = null;
    return;
  }
  trustedActor = {
    id: user.id,
    full_name: user.full_name,
    role: user.role,
  };
}

export function clearActivityActor() {
  trustedActor = null;
}

export function getActivityActor() {
  return trustedActor;
}
