import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { createBlogComment, getBlogComments, getBlogPostDetail } from './useBoardgameApi';
import { getAuthToken, getAuthUser, isAuthenticated } from './auth';
import { formatBlogDate } from './blogUtils';
import '../css/Blog.css';

function BlogDetail() {
  const { slug } = useParams();
  const authState = getAuthUser();
  const authUser = authState?.user;
  const token = getAuthToken();
  const [post, setPost] = useState(null);
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setErrorMessage('');
        setLoading(true);
        const [postPayload, commentRows] = await Promise.all([
          getBlogPostDetail(slug),
          getBlogComments(slug),
        ]);

        if (!active) {
          return;
        }

        setPost(postPayload?.post || null);
        setRelatedPosts(Array.isArray(postPayload?.relatedPosts) ? postPayload.relatedPosts : []);
        setComments(Array.isArray(commentRows) ? commentRows : []);
      } catch (error) {
        if (active) {
          setErrorMessage(error.message || 'Không thể tải bài viết.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [slug]);

  const canComment = useMemo(() => isAuthenticated(), []);

  async function handleSubmitComment(event) {
    event.preventDefault();

    if (!commentText.trim()) {
      return;
    }

    try {
      setErrorMessage('');
      await createBlogComment(slug, {
        authorName: authUser?.displayName || authUser?.email || 'Khách hàng',
        content: commentText,
      }, token);

      setStatusMessage('Đã gửi bình luận. Bình luận sẽ hiển thị sau khi được duyệt.');
      setCommentText('');
      const commentRows = await getBlogComments(slug);
      setComments(Array.isArray(commentRows) ? commentRows : []);
    } catch (error) {
      setErrorMessage(error.message || 'Không thể gửi bình luận.');
    }
  }

  if (!slug) {
    return <Navigate to="/blog" replace />;
  }

  return (
    <section className="card-surface blog-detail-page">
      {loading ? <p>Đang tải bài viết...</p> : null}
      {errorMessage ? <p className="blog-feedback error">{errorMessage}</p> : null}

      {post ? (
        <>
          <header className="blog-detail-header">
            <span className="blog-category">{post.category}</span>
            <h1>{post.title}</h1>
            <div className="blog-meta-row">
              <span>{formatBlogDate(post.date || post.publishedAt || post.createdAt || post.updatedAt)}</span>
              <span>{post.authorName || 'Nhân viên biên tập'}</span>
              <span>{Number(post.views || 0).toLocaleString('vi-VN')} lượt xem</span>
            </div>
          </header>

          <img className="blog-detail-cover" src={post.coverImage || '/image/catan.jpg'} alt={post.title} loading="lazy" />

          <article className="blog-detail-content">
            {(post.content || '').split('\n').filter(Boolean).map((line, index) => (
              <p key={`line-${index + 1}`}>{line}</p>
            ))}
          </article>

          <section className="blog-comments-section">
            <h2>Bình luận khách hàng</h2>
            {comments.length === 0 ? <p>Chưa có bình luận nào cho bài viết này.</p> : null}
            <div className="blog-comment-list">
              {comments.map((comment) => (
                <article key={comment.id} className="blog-comment-item">
                  <strong>{comment.authorName || 'Khách hàng'}</strong>
                  <span>{new Date(comment.createdAt || Date.now()).toLocaleString('vi-VN')}</span>
                  <p>{comment.content}</p>
                </article>
              ))}
            </div>

            {canComment ? (
              <form className="blog-comment-form" onSubmit={handleSubmitComment}>
                <textarea
                  rows="4"
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Viết bình luận của bạn..."
                />
                <button type="submit" className="primary-button">Gửi bình luận</button>
              </form>
            ) : (
              <p>Vui lòng <Link to="/login">đăng nhập</Link> để bình luận bài viết.</p>
            )}

            {statusMessage ? <p className="blog-feedback success">{statusMessage}</p> : null}
          </section>

          <section className="blog-related-section">
            <h2>Bài viết liên quan</h2>
            <div className="blog-related-grid">
              {relatedPosts.map((item) => (
                <article key={`rel-${item.id}`} className="blog-page-card">
                  <img src={item.coverImage || '/image/catan.jpg'} alt={item.title} loading="lazy" />
                  <span className="blog-category">{item.category}</span>
                  <h3>{item.title}</h3>
                  <p>{item.summary || item.excerpt}</p>
                  <Link className="secondary-button" to={`/blog/${item.slug}`}>Đọc tiếp</Link>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}

export default BlogDetail;
