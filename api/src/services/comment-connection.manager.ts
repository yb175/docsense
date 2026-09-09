import type { WSContext } from 'hono/ws';

export class CommentConnectionManager {
  private readonly byDocument = new Map<string, Set<WSContext>>();

  add(documentId: string, socket: WSContext) {
    const connections = this.byDocument.get(documentId) ?? new Set<WSContext>();
    connections.add(socket);
    this.byDocument.set(documentId, connections);
  }

  remove(documentId: string, socket: WSContext) {
    const connections = this.byDocument.get(documentId);
    if (!connections) return;
    connections.delete(socket);
    if (connections.size === 0) this.byDocument.delete(documentId);
  }

  getConnections(documentId: string): ReadonlySet<WSContext> {
    const connections = this.byDocument.get(documentId);
    if (!connections) return new Set();
    for (const socket of connections) {
      if (socket.readyState === 2 || socket.readyState === 3) connections.delete(socket);
    }
    if (connections.size === 0) this.byDocument.delete(documentId);
    return connections;
  }
}

export const commentConnections = new CommentConnectionManager();
