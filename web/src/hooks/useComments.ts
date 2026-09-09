import { useEffect, useRef, useState } from 'react';
import { API } from '../config';
import { insertComment } from '../services/comment-state';
export { insertComment } from '../services/comment-state';

export type CommentMark = 'bold' | 'italic';
export type CommentSpan = { text: string; marks: CommentMark[] };
export type CommentContent = {
  blocks: ({ type: 'paragraph'; content: CommentSpan[] } | { type: 'bulletList'; items: CommentSpan[][] })[];
};
export type CommentAuthor = { type: 'user' | 'guest'; id: string | null; name?: string };
export type Comment = {
  id: string;
  documentId: string;
  parentId: string | null;
  content: CommentContent;
  createdAt: string;
  updatedAt?: string;
  author: CommentAuthor;
  replies: Comment[];
};

type CommentEvent = { type: 'comment.created'; documentId: string; comment: Omit<Comment, 'replies' | 'documentId'> & { documentId?: string } };

async function loadComments(documentId: string): Promise<Comment[]> {
  const response = await fetch(`${API}/api/documents/${documentId}/comments`, { credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Unable to load comments');
  return (data.comments ?? []) as Comment[];
}

const websocketUrl = (documentId: string) => {
  const base = API || window.location.origin;
  const url = base.replace(/^http/u, 'ws');
  return `${url}/ws/documents/${encodeURIComponent(documentId)}/comments`;
};

export function useComments(documentId: string) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: number | undefined;
    let reconnectAttempts = 0;

    const refresh = async () => {
      const loaded = await loadComments(documentId);
      if (!disposed) {
        setComments(loaded);
        setError('');
      }
    };
    const connect = async () => {
      try {
        await refresh();
        if (disposed) return;
        const socket = new WebSocket(websocketUrl(documentId));
        socketRef.current = socket;
        socket.onopen = () => { reconnectAttempts = 0; setConnected(true); };
        socket.onmessage = (message) => {
          try {
            const event = JSON.parse(message.data) as CommentEvent;
            if (event.type !== 'comment.created' || event.documentId !== documentId || event.comment.documentId && event.comment.documentId !== documentId) return;
            setComments((current) => insertComment(current, {
              ...event.comment,
              documentId,
              replies: [],
            }));
          } catch {
            // Ignore malformed events; REST remains the authoritative state.
          }
        };
        socket.onerror = () => socket.close();
        socket.onclose = () => {
          if (disposed) return;
          setConnected(false);
          if (reconnectAttempts >= 5) return;
          reconnectAttempts += 1;
          reconnectTimer = window.setTimeout(() => { void connect(); }, Math.min(500 * 2 ** (reconnectAttempts - 1), 8_000));
        };
      } catch (cause) {
        if (disposed) return;
        setError(cause instanceof Error ? cause.message : 'Unable to connect to comments');
        if (reconnectAttempts < 5) {
          reconnectAttempts += 1;
          reconnectTimer = window.setTimeout(() => { void connect(); }, Math.min(500 * 2 ** (reconnectAttempts - 1), 8_000));
        }
      }
    };

    setError('');
    setConnected(false);
    setComments([]);
    void connect();
    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [documentId]);

  return { comments, setComments, connected, error };
}

export function commentBody(text: string): CommentContent {
  return { blocks: [{ type: 'paragraph', content: [{ text, marks: [] }] }] };
}
