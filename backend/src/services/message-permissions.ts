export function canDeleteMessage(actorUserId: string, senderUserId: string): boolean {
  return actorUserId === senderUserId;
}

export function canEditMessage(actorUserId: string, senderUserId: string): boolean {
  return actorUserId === senderUserId;
}
