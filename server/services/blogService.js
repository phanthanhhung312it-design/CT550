const BlogPost = require('../models/BlogPost');
const { blogPosts: seedBlogPosts } = require('../data/seedData');
const { isDbConnected } = require('../config/db');
const mongoose = require('mongoose');

const DEFAULT_CATEGORIES = [
  { id: 1, name: 'Review', slug: 'review' },
  { id: 2, name: 'Hướng dẫn', slug: 'huong-dan' },
  { id: 3, name: 'Tin tức', slug: 'tin-tuc' },
  { id: 4, name: 'Khuyến mãi', slug: 'khuyen-mai' },
  { id: 5, name: 'Mẹo chơi', slug: 'meo-choi' },
];

function getCollection(name) {
  return mongoose.connection.collection(name);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatDateLabel(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString('vi-VN');
  }

  return date.toLocaleDateString('vi-VN');
}

function mapSeedPost(post, index) {
  const categoryName = post.category || 'Tin tức';
  const categorySlug = slugify(categoryName) || 'tin-tuc';
  const publishedAt = new Date(Date.now() - index * 86400000);
  const summary = post.excerpt || 'Bài viết cập nhật thông tin board game mới nhất.';
  const content = [
    summary,
    'Bài viết giúp khách hàng nắm nhanh thông tin quan trọng về board game, luật chơi và mẹo chọn game phù hợp.',
    'Bạn có thể theo dõi thêm các bài liên quan trong chuyên mục để có góc nhìn đầy đủ hơn trước khi mua hoặc thuê game.',
  ].join('\n\n');

  return {
    id: toNumber(post.id, index + 1),
    title: post.title,
    slug: slugify(post.title) || `blog-${toNumber(post.id, index + 1)}`,
    category: categoryName,
    categorySlug,
    excerpt: summary,
    summary,
    content,
    coverImage: post.image || '/image/catan.jpg',
    authorName: post.authorName || 'Nhân viên biên tập',
    authorEmployeeId: post.authorEmployeeId || 1,
    views: toNumber(post.views, 50 + index * 12),
    status: 'published',
    isVisible: true,
    date: post.date || formatDateLabel(publishedAt),
    publishedAt,
  };
}

function serializePost(post) {
  const source = post?.toObject ? post.toObject() : post;
  const publishedAt = source?.publishedAt || source?.createdAt || Date.now();

  return {
    id: source?.id,
    title: source?.title || '',
    slug: source?.slug || '',
    category: source?.category || 'Tin tức',
    categorySlug: source?.categorySlug || slugify(source?.category || 'tin-tuc'),
    excerpt: source?.excerpt || source?.summary || '',
    summary: source?.summary || source?.excerpt || '',
    content: source?.content || '',
    coverImage: source?.coverImage || '/image/catan.jpg',
    authorName: source?.authorName || 'Nhân viên biên tập',
    authorEmployeeId: source?.authorEmployeeId || null,
    views: toNumber(source?.views, 0),
    status: source?.status || 'published',
    isVisible: source?.isVisible !== false,
    date: source?.date || formatDateLabel(publishedAt),
    publishedAt,
    createdAt: source?.createdAt || null,
    updatedAt: source?.updatedAt || null,
  };
}

function filterPosts(posts, options = {}) {
  const { search = '', category = '', status = '', includeHidden = false } = options;
  const normalizedSearch = normalizeText(search);
  const normalizedCategory = normalizeText(category);
  const normalizedStatus = normalizeText(status);

  return posts.filter((post) => {
    if (!includeHidden && (normalizeText(post.status) !== 'published' || post.isVisible === false)) {
      return false;
    }

    if (normalizedCategory) {
      const categoryMatch = normalizeText(post.category) === normalizedCategory || normalizeText(post.categorySlug) === normalizedCategory;
      if (!categoryMatch) {
        return false;
      }
    }

    if (normalizedStatus && normalizeText(post.status) !== normalizedStatus) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const haystack = normalizeText([post.title, post.excerpt, post.summary, post.content, post.authorName].join(' '));
    return haystack.includes(normalizedSearch);
  });
}

async function ensureBlogCategoriesSeeded() {
  if (!isDbConnected()) {
    return;
  }

  const collection = getCollection('blog_chuyenmuc');
  const rows = await collection.find({}).toArray().catch(() => []);
  if (rows.length > 0) {
    const needsNormalization = rows.every((row) => {
      const name = normalizeText(row.cm_ten || row.name || '');
      const slug = normalizeText(row.cm_slug || row.slug || '');
      return /^chuyen muc\s*\d+$/i.test(name) || /^cm-\d+$/i.test(slug);
    });
    if (needsNormalization && rows.length <= DEFAULT_CATEGORIES.length) {
      await collection.deleteMany({});
    } else {
      return;
    }
  }

  await collection.insertMany(DEFAULT_CATEGORIES.map((category) => ({
    cm_ma: category.id,
    cm_ten: category.name,
    cm_slug: category.slug,
    status: 'published',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })));
}

async function ensureBlogPostsMigrated() {
  if (!isDbConnected()) {
    return;
  }

  const rows = await BlogPost.find().sort({ id: 1 }).lean();
  for (const row of rows) {
    const categorySlug = row.categorySlug || slugify(row.category || 'tin-tuc') || 'tin-tuc';
    const slugBase = slugify(row.slug || row.title || `blog-${row.id}`) || `blog-${row.id}`;
    let nextSlug = slugBase;

    if (slugBase) {
      const duplicate = await BlogPost.findOne({ slug: slugBase, id: { $ne: row.id } }).lean();
      if (duplicate) {
        nextSlug = `${slugBase}-${row.id}`;
      }
    }

    const summary = row.summary || row.excerpt || 'Bài viết chia sẻ kinh nghiệm chơi board game.';
    const content = row.content || [
      summary,
      'Nội dung chi tiết đang được cập nhật để giúp bạn theo dõi luật chơi và kinh nghiệm thực tế rõ ràng hơn.',
    ].join('\n\n');

    const updatePayload = {
      slug: nextSlug,
      categorySlug,
      summary,
      content,
      coverImage: row.coverImage || '/image/catan.jpg',
      authorName: row.authorName || 'Nhân viên biên tập',
      status: row.status || 'published',
      isVisible: row.isVisible !== false,
      views: toNumber(row.views, 0),
      date: row.date || formatDateLabel(row.publishedAt || row.createdAt || Date.now()),
      publishedAt: row.publishedAt || row.createdAt || new Date(),
    };

    await BlogPost.updateOne({ id: row.id }, { $set: updatePayload }).catch(() => {});
  }
}

async function ensureBlogCommentsCollection() {
  if (!isDbConnected()) {
    return;
  }

  await getCollection('blog_binhluan').createIndex({ bl_ma: 1 }, { unique: true }).catch(() => {});
  await getCollection('blog_binhluan').createIndex({ blog_ma: 1, created_at: -1 }).catch(() => {});
}

async function ensureBlogSeeded() {
  if (!isDbConnected()) {
    return null;
  }

  await ensureBlogCategoriesSeeded();
  await ensureBlogCommentsCollection();

  const count = await BlogPost.countDocuments();
  if (count > 0) {
    await ensureBlogPostsMigrated();
    return null;
  }

  await BlogPost.insertMany(seedBlogPosts.map((post, index) => mapSeedPost(post, index)));
  return null;
}

async function getNextPostId() {
  const latest = await BlogPost.findOne().sort({ id: -1 }).lean();
  return toNumber(latest?.id, 0) + 1;
}

async function getNextCommentId() {
  const latest = await getCollection('blog_binhluan')
    .find({ bl_ma: { $type: 'number' } })
    .sort({ bl_ma: -1 })
    .limit(1)
    .next()
    .catch(() => null);

  return toNumber(latest?.bl_ma, 0) + 1;
}

async function listBlogCategories() {
  if (!isDbConnected()) {
    return [...DEFAULT_CATEGORIES];
  }

  await ensureBlogSeeded();
  const rows = await getCollection('blog_chuyenmuc').find({}).sort({ cm_ma: 1 }).toArray().catch(() => []);
  const mappedRows = rows.map((row, index) => ({
    id: toNumber(row.cm_ma || row.id, index + 1),
    name: row.cm_ten || row.name || `Chuyên mục ${index + 1}`,
    slug: row.cm_slug || row.slug || slugify(row.cm_ten || row.name || `cm-${index + 1}`),
    status: row.status || 'published',
  }));

  const isPlaceholderDataset = mappedRows.length > 0 && mappedRows.every((row) => {
    const normalizedName = normalizeText(row.name);
    const normalizedSlug = normalizeText(row.slug);
    return /^chuyen muc\s*\d+$/i.test(normalizedName) || /^cm-\d+$/i.test(normalizedSlug);
  });

  if (mappedRows.length === 0 || isPlaceholderDataset) {
    const postRows = await BlogPost.find().sort({ id: 1 }).lean();
    const derived = [...new Set(postRows.map((item) => String(item.category || '').trim()).filter(Boolean))]
      .map((name, index) => ({ id: index + 1, name, slug: slugify(name), status: 'published' }));

    const categories = derived.length > 0 ? derived : [...DEFAULT_CATEGORIES];
    await getCollection('blog_chuyenmuc').deleteMany({}).catch(() => {});
    await getCollection('blog_chuyenmuc').insertMany(categories.map((category) => ({
      cm_ma: category.id,
      cm_ten: category.name,
      cm_slug: category.slug,
      status: category.status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))).catch(() => {});

    return categories;
  }

  return mappedRows;
}

async function listBlogPosts(options = {}) {
  if (!isDbConnected()) {
    const fallback = seedBlogPosts.map((post, index) => serializePost(mapSeedPost(post, index)));
    return filterPosts(fallback, options);
  }

  await ensureBlogSeeded();
  const rows = await BlogPost.find().sort({ publishedAt: -1, createdAt: -1 }).lean();
  const serializedRows = rows.map((row) => serializePost(row));
  return filterPosts(serializedRows, options);
}

async function findPostBySlug(slug) {
  if (!isDbConnected()) {
    const fallback = seedBlogPosts.map((post, index) => serializePost(mapSeedPost(post, index)));
    return fallback.find((post) => post.slug === slug || String(post.id) === String(slug)) || null;
  }

  await ensureBlogSeeded();
  const post = await BlogPost.findOne({ $or: [{ slug }, { id: toNumber(slug, -1) }] }).lean();
  return post ? serializePost(post) : null;
}

async function getBlogPostDetail(slug, options = {}) {
  const { includeHidden = false, incrementView = true } = options;
  const post = await findPostBySlug(slug);
  if (!post) {
    return null;
  }

  if (!includeHidden && (normalizeText(post.status) !== 'published' || post.isVisible === false)) {
    return null;
  }

  if (incrementView && isDbConnected()) {
    await BlogPost.updateOne({ id: post.id }, { $inc: { views: 1 }, $set: { updatedAt: new Date() } }).catch(() => {});
    return {
      ...post,
      views: toNumber(post.views, 0) + 1,
    };
  }

  return post;
}

async function createBlogPost(payload = {}) {
  if (!isDbConnected()) {
    throw new Error('Không thể tạo bài viết khi chưa kết nối cơ sở dữ liệu.');
  }

  await ensureBlogSeeded();
  const id = await getNextPostId();
  const title = String(payload.title || '').trim();
  const summary = String(payload.summary || payload.excerpt || '').trim();
  const content = String(payload.content || '').trim();
  const category = String(payload.category || 'Tin tức').trim();
  const categorySlug = String(payload.categorySlug || slugify(category) || 'tin-tuc').trim();
  const slugBase = slugify(payload.slug || title) || `blog-${id}`;
  const slugExists = await BlogPost.findOne({ slug: slugBase }).lean();
  const slug = slugExists ? `${slugBase}-${id}` : slugBase;

  const document = await BlogPost.create({
    id,
    title,
    slug,
    category,
    categorySlug,
    excerpt: summary,
    summary,
    content,
    coverImage: String(payload.coverImage || '/image/catan.jpg').trim(),
    authorName: String(payload.authorName || 'Nhân viên biên tập').trim(),
    authorEmployeeId: payload.authorEmployeeId ? toNumber(payload.authorEmployeeId, null) : null,
    views: toNumber(payload.views, 0),
    status: String(payload.status || 'draft').trim(),
    isVisible: payload.isVisible !== false,
    date: formatDateLabel(payload.publishedAt || Date.now()),
    publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : new Date(),
  });

  return serializePost(document);
}

async function updateBlogPost(id, payload = {}) {
  if (!isDbConnected()) {
    throw new Error('Không thể cập nhật bài viết khi chưa kết nối cơ sở dữ liệu.');
  }

  await ensureBlogSeeded();
  const current = await BlogPost.findOne({ id: toNumber(id, -1) }).lean();
  if (!current) {
    return null;
  }

  const title = String(payload.title || current.title || '').trim();
  const slugBase = slugify(payload.slug || title) || current.slug;
  const sameSlugPost = await BlogPost.findOne({ slug: slugBase, id: { $ne: current.id } }).lean();

  const updatePayload = {
    title,
    slug: sameSlugPost ? `${slugBase}-${current.id}` : slugBase,
    category: String(payload.category || current.category || 'Tin tức').trim(),
    categorySlug: String(payload.categorySlug || slugify(payload.category || current.category || 'tin-tuc') || current.categorySlug || 'tin-tuc').trim(),
    excerpt: String(payload.summary || payload.excerpt || current.excerpt || '').trim(),
    summary: String(payload.summary || payload.excerpt || current.summary || '').trim(),
    content: String(payload.content || current.content || '').trim(),
    coverImage: String(payload.coverImage || current.coverImage || '/image/catan.jpg').trim(),
    authorName: String(payload.authorName || current.authorName || 'Nhân viên biên tập').trim(),
    authorEmployeeId: payload.authorEmployeeId ? toNumber(payload.authorEmployeeId, null) : current.authorEmployeeId || null,
    status: String(payload.status || current.status || 'draft').trim(),
    isVisible: payload.isVisible === undefined ? current.isVisible !== false : Boolean(payload.isVisible),
    date: formatDateLabel(payload.publishedAt || current.publishedAt || Date.now()),
    publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : current.publishedAt || new Date(),
    updatedAt: new Date(),
  };

  const updated = await BlogPost.findOneAndUpdate(
    { id: current.id },
    { $set: updatePayload },
    { new: true }
  ).lean();

  return updated ? serializePost(updated) : null;
}

async function deleteBlogPost(id) {
  if (!isDbConnected()) {
    throw new Error('Không thể xóa bài viết khi chưa kết nối cơ sở dữ liệu.');
  }

  await ensureBlogSeeded();
  const postId = toNumber(id, -1);
  const result = await BlogPost.deleteOne({ id: postId });
  await getCollection('blog_binhluan').deleteMany({ blog_ma: postId }).catch(() => {});
  return result.deletedCount > 0;
}

async function setBlogPostStatus(id, status, isVisible) {
  if (!isDbConnected()) {
    throw new Error('Không thể cập nhật trạng thái khi chưa kết nối cơ sở dữ liệu.');
  }

  await ensureBlogSeeded();
  const nextStatus = String(status || 'draft').trim();
  const updated = await BlogPost.findOneAndUpdate(
    { id: toNumber(id, -1) },
    {
      $set: {
        status: nextStatus,
        isVisible: isVisible === undefined ? nextStatus === 'published' : Boolean(isVisible),
        updatedAt: new Date(),
      },
    },
    { new: true }
  ).lean();

  return updated ? serializePost(updated) : null;
}

function serializeComment(row) {
  return {
    id: toNumber(row.bl_ma || row.id, 0),
    postId: toNumber(row.blog_ma || row.postId, 0),
    postSlug: row.blog_slug || row.postSlug || '',
    authorName: row.user_name || row.authorName || 'Khách hàng',
    userId: row.user_ma || row.userId || null,
    content: row.bl_noidung || row.content || '',
    status: row.status || 'approved',
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
  };
}

async function listBlogComments(postId, options = {}) {
  const { includeHidden = false } = options;

  if (!isDbConnected()) {
    return [];
  }

  await ensureBlogSeeded();
  const query = {};
  if (postId) {
    query.blog_ma = toNumber(postId, 0);
  }

  if (!includeHidden) {
    query.status = 'approved';
  }

  const rows = await getCollection('blog_binhluan').find(query).sort({ created_at: -1, bl_ma: -1 }).toArray().catch(() => []);
  return rows.map(serializeComment);
}

async function addBlogComment(post, payload = {}) {
  if (!isDbConnected()) {
    throw new Error('Không thể gửi bình luận khi chưa kết nối cơ sở dữ liệu.');
  }

  await ensureBlogSeeded();
  const commentId = await getNextCommentId();
  const content = String(payload.content || '').trim();
  if (!content) {
    throw new Error('Nội dung bình luận không được để trống.');
  }

  const document = {
    bl_ma: commentId,
    blog_ma: post.id,
    blog_slug: post.slug,
    user_ma: payload.userId ? toNumber(payload.userId, null) : null,
    user_name: String(payload.authorName || 'Khách hàng').trim(),
    bl_noidung: content,
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await getCollection('blog_binhluan').insertOne(document);
  return serializeComment(document);
}

async function updateBlogCommentStatus(commentId, status) {
  if (!isDbConnected()) {
    throw new Error('Không thể cập nhật bình luận khi chưa kết nối cơ sở dữ liệu.');
  }

  await ensureBlogSeeded();
  const nextStatus = String(status || 'approved').trim();
  const result = await getCollection('blog_binhluan').findOneAndUpdate(
    { bl_ma: toNumber(commentId, -1) },
    { $set: { status: nextStatus, updated_at: new Date().toISOString() } },
    { returnDocument: 'after' }
  );

  const row = result?.value || result;
  return row ? serializeComment(row) : null;
}

async function deleteBlogComment(commentId) {
  if (!isDbConnected()) {
    throw new Error('Không thể xóa bình luận khi chưa kết nối cơ sở dữ liệu.');
  }

  await ensureBlogSeeded();
  const result = await getCollection('blog_binhluan').deleteOne({ bl_ma: toNumber(commentId, -1) });
  return result.deletedCount > 0;
}

module.exports = {
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
};
