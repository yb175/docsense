export type ThreadedComment = { id: string; parentId: string | null; replies: ThreadedComment[] };

export function insertComment<T extends ThreadedComment>(current: T[], incoming: T): T[] {
  if (current.some((comment) => comment.id === incoming.id || comment.replies.some((reply) => reply.id === incoming.id))) return current;
  if (!incoming.parentId) return [...current, incoming];
  const root = current.find((comment) => comment.id === incoming.parentId || comment.replies.some((reply) => reply.id === incoming.parentId));
  if (!root) return current;
  return current.map((comment) => comment.id === root.id ? { ...comment, replies: [...comment.replies, incoming] } : comment);
}
