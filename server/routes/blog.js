const express = require('express');
const jwt = require('jsonwebtoken');
const {
  addBlogComment,
  createBlogPost,
  deleteBlogComment,
  deleteBlogPost,
  findPostBySlug,
  getBlogPostDetail,
  listBlogCategories,
  listBlogComments,
  listBlogPosts,
  setBlogPostStatus,
  updateBlogCommentStatus,
  updateBlogPost,
} = require('../services/blogService');

const router = express.Router();

function getAuthPayload(req) {
  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice(7).trim();
  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'boardgamevn-secret-key');
  } catch {
    return null;
  }
}

function requireRoles(roles) {
  return (req, res, next) => {
    const payload = getAuthPayload(req);
    const role = String(payload?.role || '').toLowerCase();
    if (!payload || !roles.includes(role)) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này.' });
    }

    req.authUser = payload;
    return next();
  };
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'draft' || status === 'archived' || status === 'published') {
    return status;
  }

  return 'draft';
}

router.get('/categories', async (req, res, next) => {
  try {
    const categories = await listBlogCategories();
    res.json(categories);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/posts', requireRoles(['admin', 'employee']), async (req, res, next) => {
  try {
    const { search = '', category = '', status = '' } = req.query;
    const posts = await listBlogPosts({
      search,
      category,
      status,
      includeHidden: true,
    });

    res.json(posts);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/posts', requireRoles(['admin', 'employee']), async (req, res, next) => {
  try {
    const payload = req.body || {};
    const createdPost = await createBlogPost({
      ...payload,
      status: normalizeStatus(payload.status),
      authorName: payload.authorName || req.authUser?.email || 'Nhân viên biên tập',
      authorEmployeeId: Number(req.authUser?.sub || 0) || null,
    });

    res.status(201).json(createdPost);
  } catch (error) {
    next(error);
  }
});

router.put('/admin/posts/:id', requireRoles(['admin', 'employee']), async (req, res, next) => {
  try {
    const payload = req.body || {};
    const updatedPost = await updateBlogPost(req.params.id, {
      ...payload,
      status: normalizeStatus(payload.status),
    });

    if (!updatedPost) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết.' });
    }

    return res.json(updatedPost);
  } catch (error) {
    return next(error);
  }
});

router.patch('/admin/posts/:id/status', requireRoles(['admin', 'employee']), async (req, res, next) => {
  try {
    const { status, isVisible } = req.body || {};
    const updatedPost = await setBlogPostStatus(req.params.id, normalizeStatus(status), isVisible);

    if (!updatedPost) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết.' });
    }

    return res.json(updatedPost);
  } catch (error) {
    return next(error);
  }
});

router.delete('/admin/posts/:id', requireRoles(['admin', 'employee']), async (req, res, next) => {
  try {
    const deleted = await deleteBlogPost(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết để xóa.' });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.get('/comments', requireRoles(['admin', 'employee']), async (req, res, next) => {
  try {
    const postId = req.query.postId ? Number(req.query.postId) : null;
    const comments = await listBlogComments(postId, { includeHidden: true });
    res.json(comments);
  } catch (error) {
    next(error);
  }
});

router.patch('/comments/:id/status', requireRoles(['admin', 'employee']), async (req, res, next) => {
  try {
    const status = String(req.body?.status || 'approved').trim().toLowerCase();
    const allowedStatus = ['approved', 'hidden', 'pending'].includes(status) ? status : 'approved';
    const updated = await updateBlogCommentStatus(req.params.id, allowedStatus);
    if (!updated) {
      return res.status(404).json({ message: 'Không tìm thấy bình luận.' });
    }

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

router.delete('/comments/:id', requireRoles(['admin', 'employee']), async (req, res, next) => {
  try {
    const deleted = await deleteBlogComment(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Không tìm thấy bình luận.' });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { search = '', category = '' } = req.query;
    const posts = await listBlogPosts({ search, category, includeHidden: false });
    res.json(posts);
  } catch (error) {
    next(error);
  }
});

router.get('/:slug/comments', async (req, res, next) => {
  try {
    const post = await findPostBySlug(req.params.slug);
    if (!post) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết.' });
    }

    const comments = await listBlogComments(post.id, { includeHidden: false });
    return res.json(comments);
  } catch (error) {
    return next(error);
  }
});

router.post('/:slug/comments', requireRoles(['customer', 'admin', 'employee']), async (req, res, next) => {
  try {
    const post = await findPostBySlug(req.params.slug);
    if (!post) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết.' });
    }

    const comment = await addBlogComment(post, {
      userId: req.authUser?.sub,
      authorName: req.body?.authorName || req.authUser?.email || 'Khách hàng',
      content: req.body?.content || '',
    });

    return res.status(201).json(comment);
  } catch (error) {
    return next(error);
  }
});

router.get('/:slug', async (req, res, next) => {
  try {
    const post = await getBlogPostDetail(req.params.slug, { includeHidden: false, incrementView: true });
    if (!post) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết.' });
    }

    const relatedPosts = (await listBlogPosts({ category: post.categorySlug, includeHidden: false }))
      .filter((item) => item.id !== post.id)
      .slice(0, 4);

    return res.json({
      post,
      relatedPosts,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
