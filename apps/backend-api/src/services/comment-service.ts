import { query } from '../config/database.js';

export interface RequestCommentRecord {
  id: string;
  request_id: string;
  author_username: string;
  author_role: string;
  content: string;
  created_at: Date;
}

export function resolvePrimaryRole(roles: string[]): string {
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('canbo')) return 'canbo';
  if (roles.includes('giangvien')) return 'giangvien';
  return 'sinhvien';
}

export class CommentService {
  async listByRequestId(requestId: string): Promise<RequestCommentRecord[]> {
    const result = await query(
      `SELECT id, request_id, author_username, author_role, content, created_at
       FROM request_comments
       WHERE request_id = $1
       ORDER BY created_at ASC;`,
      [requestId]
    );
    return result.rows as RequestCommentRecord[];
  }

  async createComment(input: {
    requestId: string;
    authorUsername: string;
    authorRoles: string[];
    content: string;
  }): Promise<RequestCommentRecord> {
    const result = await query(
      `INSERT INTO request_comments (request_id, author_username, author_role, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, request_id, author_username, author_role, content, created_at;`,
      [
        input.requestId,
        input.authorUsername,
        resolvePrimaryRole(input.authorRoles),
        input.content,
      ]
    );
    return result.rows[0] as RequestCommentRecord;
  }
}

export const commentService = new CommentService();
