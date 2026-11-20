import { describe, expect, it } from 'vite-plus/test';

import {
  COMMENT_EDIT_WINDOW,
  getCommentPermissions,
} from '../src/components/comment/commentPermissions';

const createdAt = '2026-01-01T00:00:00Z';
const created = new Date(createdAt).getTime();
const comment = { authorId: 1, status: 0 as const, createdAt };
const owner = { userId: 1, asAdmin: false, canReply: true };

describe('评论操作权限', () => {
  it('作者的编辑、删除权限在 20 分钟边界后失效，回复不受编辑期限影响', () => {
    const atDeadline = getCommentPermissions(
      comment,
      owner,
      created + COMMENT_EDIT_WINDOW,
    );
    expect(atDeadline).toMatchObject({
      canEdit: true,
      canDelete: true,
      canReply: true,
    });
    expect(
      getCommentPermissions(comment, owner, created + COMMENT_EDIT_WINDOW + 1),
    ).toMatchObject({ canEdit: false, canDelete: false, canReply: true });
  });

  it('其他用户只能回复、拉黑；评论锁定或无小说访问权限时不能回复', () => {
    const viewer = { ...owner, userId: 2 };
    expect(getCommentPermissions(comment, viewer, created)).toMatchObject({
      canReply: true,
      canEdit: false,
      canDelete: false,
      canBlockAuthor: true,
      canModerateAuthor: false,
    });
    expect(
      getCommentPermissions(comment, { ...viewer, canReply: false }, created)
        .canReply,
    ).toBe(false);
    expect(getCommentPermissions(comment, owner, created).canBlockAuthor).toBe(
      false,
    );
  });

  it('未登录用户只能复制已发布评论，不能触发写操作', () => {
    expect(
      getCommentPermissions(
        comment,
        { asAdmin: false, canReply: true },
        created,
      ),
    ).toEqual({
      canReply: false,
      canEdit: false,
      canDelete: false,
      canBlockAuthor: false,
      canModerateAuthor: false,
      showActions: true,
    });
  });

  it('管理员可编辑过期评论、删除和管理其他作者，但不能拉黑或处罚自己', () => {
    const admin = { userId: 2, asAdmin: true, canReply: true };
    expect(
      getCommentPermissions(comment, admin, created + COMMENT_EDIT_WINDOW + 1),
    ).toMatchObject({
      canEdit: true,
      canDelete: true,
      canModerateAuthor: true,
    });
    expect(
      getCommentPermissions(comment, { ...admin, userId: 1 }, created),
    ).toMatchObject({
      canBlockAuthor: false,
      canModerateAuthor: false,
    });
  });

  it.each([1, 2] as const)(
    '状态 %s 的评论不能编辑或回复，普通用户不可见操作区',
    (status) => {
      const moderated = { ...comment, status };
      expect(getCommentPermissions(moderated, owner, created)).toMatchObject({
        canReply: false,
        canEdit: false,
        canDelete: false,
        showActions: false,
      });
      expect(
        getCommentPermissions(
          moderated,
          { ...owner, userId: 2, asAdmin: true },
          created,
        ),
      ).toMatchObject({
        canReply: false,
        canEdit: false,
        canDelete: true,
        showActions: status === 1,
      });
    },
  );
});
