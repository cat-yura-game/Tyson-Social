export function canDeleteMessage(actorUserId: string, senderUserId: string): boolean {
  return actorUserId === senderUserId;
}
