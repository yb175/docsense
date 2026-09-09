export type CommentCreatedEvent = {
  type: 'comment.created';
  documentId: string;
  comment: {
    id: string;
    parentId: string | null;
    content: unknown;
    author: {
      type: 'user' | 'guest';
      id: string | null;
      name?: string;
    };
    createdAt: string;
  };
};
