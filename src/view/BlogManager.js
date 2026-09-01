import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  createAdminBlogPost,
  deleteAdminBlogComment,
  deleteAdminBlogPost,
  getAdminBlogComments,
  getAdminBlogPosts,
  updateAdminBlogCommentStatus,
  updateAdminBlogPost,
  updateAdminBlogPostStatus,
  useBlogCategories,
} from './useBoardgameApi';
import { getAuthToken, getAuthUser, isAuthenticated } from './auth';
import '../css/BlogManager.css';

const initialFormState = {
  title: '',
  category: 'Tin tức',
  categorySlug: 'tin-tuc',
  coverImage: '/image/catan.jpg',
  summary: '',
  content: '',
  status: 'draft',
  isVisible: true,
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function buildSummaryFromContent(content, title) {
  const cleanedContent = String(content || '')
    .trim()
    .replace(/\s+/g, ' ');

  if (cleanedContent) {
    return cleanedContent.slice(0, 180);
  }

  return String(title || '').trim();
}

function readJpgFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh.'));
    reader.readAsDataURL(file);
  });
}

function BlogManager() {
  const authState = getAuthUser();
  const authUser = authState?.user;
  const authRole = String(authUser?.role || '').toLowerCase();
  const token = getAuthToken();

  const categories = useBlogCategories();
  const [posts, setPosts] = useState([]);
  const [comments, setComments] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedPostId, setSelectedPostId] = useState('');
  const [formState, setFormState] = useState(initialFormState);
  const [editingPostId, setEditingPostId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const canManage = authRole === 'admin' || authRole === 'employee';

  const selectedPost = useMemo(() => {
    if (!selectedPostId) {
      return null;
    }

    return posts.find((post) => String(post.id) === String(selectedPostId)) || null;
  }, [posts, selectedPostId]);

  const contentStats = useMemo(() => ({
    total: posts.length,
    published: posts.filter((post) => String(post.status) === 'published' && post.isVisible !== false).length,
    drafts: posts.filter((post) => String(post.status) === 'draft').length,
    hidden: posts.filter((post) => String(post.status) === 'archived' || post.isVisible === false).length,
    comments: comments.length,
  }), [comments.length, posts]);

  const filteredPosts = useMemo(() => {
    const query = normalizeText(searchText);
    const categoryQuery = normalizeText(categoryFilter);
    const statusQuery = normalizeText(statusFilter);

    return posts.filter((post) => {
      const matchesSearch = !query || normalizeText(post.title).includes(query);
      const matchesCategory = !categoryQuery || normalizeText(post.categorySlug || post.category) === categoryQuery;
      const matchesStatus = !statusQuery || normalizeText(post.status) === statusQuery;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [categoryFilter, posts, searchText, statusFilter]);

  const commentsForSelectedPost = useMemo(() => {
    if (!selectedPost) {
      return [];
    }

    return comments.filter((comment) => String(comment.postId) === String(selectedPost.id));
  }, [comments, selectedPost]);

  const visibleCommentCount = useMemo(() => commentsForSelectedPost.filter((comment) => normalizeText(comment.status) !== 'hidden').length, [commentsForSelectedPost]);

  const loadData = useCallback(async () => {
    if (!token) {
      return;
    }

    try {
      setErrorMessage('');
      const [postRows, commentRows] = await Promise.all([
        getAdminBlogPosts(token, {
          search: searchText,
          category: categoryFilter,
          status: statusFilter,
        }),
        getAdminBlogComments(token),
      ]);

      setPosts(Array.isArray(postRows) ? postRows : []);
      setComments(Array.isArray(commentRows) ? commentRows : []);
    } catch (error) {
      setErrorMessage(error.message || 'Không thể tải dữ liệu quản lý blog.');
    }
  }, [categoryFilter, searchText, statusFilter, token]);

  useEffect(() => {
    if (canManage) {
      loadData();
    }
  }, [canManage, loadData]);

  useEffect(() => {
    if (categories.length > 0 && !formState.categorySlug) {
      setFormState((current) => ({
        ...current,
        category: categories[0].name,
        categorySlug: categories[0].slug,
      }));
    }
  }, [categories, formState.categorySlug]);

  function resetForm() {
    setFormState(initialFormState);
    setEditingPostId(null);
  }

  function openCreateForm() {
    setSelectedPostId('');
    resetForm();
  }

  function fillForm(post) {
    setEditingPostId(post.id);
    setFormState({
      title: post.title || '',
      category: post.category || 'Tin tức',
      categorySlug: post.categorySlug || 'tin-tuc',
      coverImage: post.coverImage || '/image/catan.jpg',
      summary: post.summary || post.excerpt || '',
      content: post.content || '',
      status: post.status || 'draft',
      isVisible: post.isVisible !== false,
    });
  }

  async function handleCoverImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const fileName = String(file.name || '').toLowerCase();
    if (!fileName.endsWith('.jpg')) {
      setErrorMessage('Chỉ chấp nhận tệp có đuôi .jpg.');
      event.target.value = '';
      return;
    }

    try {
      setErrorMessage('');
      const dataUrl = await readJpgFileAsDataUrl(file);
      setFormState((current) => ({
        ...current,
        coverImage: dataUrl,
      }));
    } catch (error) {
      setErrorMessage(error.message || 'Không thể chọn ảnh đại diện.');
    }
  }

  function viewPost(post) {
    setSelectedPostId(String(post.id));
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return date.toLocaleDateString('vi-VN');
  }

  function getStatusLabel(value) {
    if (value === 'published') {
      return 'Hiển thị';
    }
    if (value === 'archived') {
      return 'Ẩn';
    }
    return 'Bản nháp';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!token) {
      return;
    }

    try {
      setErrorMessage('');
      const summary = buildSummaryFromContent(formState.content, formState.title);
      const payload = {
        ...formState,
        summary,
      };

      if (editingPostId) {
        await updateAdminBlogPost(token, editingPostId, payload);
        setStatusMessage('Đã cập nhật bài viết.');
      } else {
        await createAdminBlogPost(token, payload);
        setStatusMessage('Đã thêm bài viết mới.');
      }
      resetForm();
      await loadData();
    } catch (error) {
      setErrorMessage(error.message || 'Không thể lưu bài viết.');
    }
  }

  async function handleDeletePost(postId) {
    if (!window.confirm('Xóa bài viết này?')) {
      return;
    }

    try {
      setErrorMessage('');
      await deleteAdminBlogPost(token, postId);
      setStatusMessage('Đã xóa bài viết.');
      await loadData();
    } catch (error) {
      setErrorMessage(error.message || 'Không thể xóa bài viết.');
    }
  }

  async function handleToggleStatus(post) {
    const nextStatus = post.status === 'published' ? 'archived' : 'published';

    try {
      setErrorMessage('');
      await updateAdminBlogPostStatus(token, post.id, nextStatus, nextStatus === 'published');
      setStatusMessage('Đã cập nhật trạng thái hiển thị bài viết.');
      await loadData();
    } catch (error) {
      setErrorMessage(error.message || 'Không thể cập nhật trạng thái bài viết.');
    }
  }

  async function handleCommentStatus(commentId, status) {
    try {
      setErrorMessage('');
      await updateAdminBlogCommentStatus(token, commentId, status);
      setStatusMessage('Đã cập nhật trạng thái bình luận.');
      await loadData();
    } catch (error) {
      setErrorMessage(error.message || 'Không thể cập nhật trạng thái bình luận.');
    }
  }

  async function handleDeleteComment(commentId) {
    if (!window.confirm('Xóa bình luận này?')) {
      return;
    }

    try {
      setErrorMessage('');
      await deleteAdminBlogComment(token, commentId);
      setStatusMessage('Đã xóa bình luận.');
      await loadData();
    } catch (error) {
      setErrorMessage(error.message || 'Không thể xóa bình luận.');
    }
  }

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (!canManage) {
    return <Navigate to="/account" replace />;
  }

  return (
    <section className="blog-manager-page card-surface">
      <header className="blog-manager-header">
        <div>
          <p className="eyebrow">Quản lý nội dung</p>
          <h1>Quản lý nội dung Blog</h1>
          <p>Thêm mới, chỉnh sửa, ẩn/hiện bài viết và kiểm duyệt bình luận khách hàng.</p>
        </div>
        <div className="blog-manager-stats">
          <article><strong>{contentStats.total}</strong><span>Bài viết</span></article>
          <article><strong>{contentStats.published}</strong><span>Đang hiển thị</span></article>
          <article><strong>{contentStats.drafts}</strong><span>Bản nháp</span></article>
          <article><strong>{contentStats.comments}</strong><span>Bình luận</span></article>
        </div>
      </header>

      <section className="blog-manager-toolbar">
        <input
          className="blog-manager-search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Tìm theo tiêu đề bài viết"
        />
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="">Tất cả chuyên mục</option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>{category.name}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="published">Hiển thị</option>
          <option value="draft">Bản nháp</option>
          <option value="archived">Ẩn</option>
        </select>
        <button className="primary-button" type="button" onClick={openCreateForm}>Thêm bài viết</button>
        <button className="secondary-button" type="button" onClick={loadData}>Làm mới</button>
      </section>

      {errorMessage ? <p className="blog-manager-feedback error">{errorMessage}</p> : null}
      {statusMessage ? <p className="blog-manager-feedback success">{statusMessage}</p> : null}

      <div className="blog-manager-grid">
        <article className="blog-manager-table-wrap">
          <table className="blog-manager-table">
            <thead>
              <tr>
                <th>Ảnh</th>
                <th>Tiêu đề</th>
                <th>Chuyên mục</th>
                <th>Người đăng</th>
                <th>Ngày đăng</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredPosts.map((post) => (
                <tr key={post.id} className={String(selectedPost?.id) === String(post.id) ? 'active' : ''}>
                  <td>
                    <div className="blog-post-thumb">
                      <img src={post.coverImage || '/image/catan.jpg'} alt={post.title} loading="lazy" />
                    </div>
                  </td>
                  <td>
                    <strong>{post.title}</strong>
                    <p>{post.summary || post.excerpt || '-'}</p>
                  </td>
                  <td>{post.category}</td>
                  <td>{post.authorName || '-'}</td>
                  <td>{formatDate(post.publishedAt || post.createdAt || post.date)}</td>
                  <td><span className={`blog-status-pill ${post.status}`}>{getStatusLabel(post.status)}</span></td>
                  <td>
                    <div className="blog-manager-actions">
                      <button type="button" className="ghost-button" onClick={() => viewPost(post)}>Xem</button>
                      <button type="button" className="ghost-button" onClick={() => { viewPost(post); fillForm(post); }}>Sửa</button>
                      <button type="button" className="ghost-button" onClick={() => handleToggleStatus(post)}>{post.status === 'published' ? 'Ẩn' : 'Hiển thị'}</button>
                      <button type="button" className="ghost-button" onClick={() => handleDeletePost(post.id)}>Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="blog-manager-form-wrap">
          <h2>{editingPostId ? 'Chỉnh sửa bài viết' : 'Thêm bài viết'}</h2>
          <form className="blog-manager-form" onSubmit={handleSubmit}>
            <label>
              Tiêu đề bài viết
              <input
                value={formState.title}
                onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
                required
              />
            </label>
            <label>
              Chuyên mục
              <select
                value={formState.categorySlug}
                onChange={(event) => {
                  const category = categories.find((item) => item.slug === event.target.value);
                  setFormState((current) => ({
                    ...current,
                    categorySlug: event.target.value,
                    category: category?.name || current.category,
                  }));
                }}
              >
                {categories.map((category) => (
                  <option key={category.slug} value={category.slug}>{category.name}</option>
                ))}
              </select>
            </label>
            <label>
              Hình ảnh đại diện
              <input
                type="file"
                accept=".jpg,image/jpeg"
                onChange={handleCoverImageChange}
              />
              <small>Chọn tệp .jpg từ máy tính. Ảnh sẽ được lưu trực tiếp cùng bài viết.</small>
            </label>
            <label>
              Nội dung bài viết
              <textarea
                rows="7"
                value={formState.content}
                onChange={(event) => setFormState((current) => ({ ...current, content: event.target.value }))}
                required
              />
            </label>
            <label>
              Trạng thái hiển thị
              <select
                value={formState.status}
                onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="draft">Bản nháp</option>
                <option value="published">Hiển thị</option>
                <option value="archived">Ẩn</option>
              </select>
            </label>
            <div className="blog-manager-form-actions">
              <button className="primary-button" type="submit">Lưu</button>
              <button className="secondary-button" type="button" onClick={resetForm}>Hủy</button>
            </div>
          </form>

          {selectedPost ? (
            <div className="blog-manager-preview">
              <h3>Xem trước bài viết</h3>
              <div className="blog-manager-preview-card">
                <img src={selectedPost.coverImage || '/image/catan.jpg'} alt={selectedPost.title} loading="lazy" />
                <div>
                  <span className={`blog-status-pill ${selectedPost.status}`}>{getStatusLabel(selectedPost.status)}</span>
                  <h4>{selectedPost.title}</h4>
                  <p>{selectedPost.summary || selectedPost.excerpt}</p>
                  <small>{selectedPost.authorName || 'Nhân viên biên tập'} · {formatDate(selectedPost.publishedAt || selectedPost.createdAt || selectedPost.date)}</small>
                </div>
              </div>
            </div>
          ) : null}
        </article>
      </div>

      <section className="blog-comments-manager">
        <h2>Quản lý bình luận khách hàng</h2>
        <p>{selectedPost ? `Bài viết: ${selectedPost.title} · ${visibleCommentCount} bình luận đang hiển thị` : 'Chọn một bài viết để xem bình luận.'}</p>
        <div className="blog-comment-list">
          {commentsForSelectedPost.map((comment) => (
            <article key={comment.id} className="blog-comment-item">
              <strong>{comment.authorName}</strong>
              <span>{new Date(comment.createdAt || Date.now()).toLocaleString('vi-VN')}</span>
              <p>{comment.content}</p>
              <span className={`blog-comment-status ${normalizeText(comment.status)}`}>{comment.status || 'pending'}</span>
              <div className="blog-manager-actions">
                <button className="ghost-button" type="button" onClick={() => handleCommentStatus(comment.id, 'approved')}>Duyệt</button>
                <button className="ghost-button" type="button" onClick={() => handleCommentStatus(comment.id, 'hidden')}>Ẩn</button>
                <button className="ghost-button" type="button" onClick={() => handleDeleteComment(comment.id)}>Xóa</button>
              </div>
            </article>
          ))}
          {commentsForSelectedPost.length === 0 ? <p>Chưa có bình luận cho bài viết này.</p> : null}
        </div>
      </section>
    </section>
  );
}

export default BlogManager;
