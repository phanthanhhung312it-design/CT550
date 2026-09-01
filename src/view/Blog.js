import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useBlogCategories, useBlogPosts } from './useBoardgameApi';
import { formatBlogDate, getBlogPreviewText } from './blogUtils';
import '../css/Blog.css';

const pageSize = 6;

const topicMap = {
  'review-board-game': ['review'],
  'tin-tuc': ['tin tuc', 'tin-tuc'],
  'huong-dan-cach-choi': ['huong dan', 'huong-dan'],
  'kien-thuc-board-game': ['kien thuc', 'review', 'huong dan'],
  'chien-thuat': ['chien thuat', 'meo choi'],
  'party-game': ['party'],
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function Blog() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [searchParams] = useSearchParams();
  const blogPosts = useBlogPosts();
  const categories = useBlogCategories();
  const selectedTopic = searchParams.get('topic') || '';
  const topicFilters = useMemo(() => topicMap[selectedTopic] || [], [selectedTopic]);
  const selectedCategory = searchParams.get('category') || '';

  useEffect(() => {
    document.title = 'Blog | Board Game VN';
  }, []);

  const filteredPosts = useMemo(() => {
    let posts = Array.isArray(blogPosts) ? blogPosts : [];

    if (selectedCategory) {
      const normalizedCategory = normalizeText(selectedCategory);
      posts = posts.filter((post) => normalizeText(post.categorySlug || post.category) === normalizedCategory);
    }

    if (topicFilters.length > 0) {
      posts = posts.filter((post) => {
        const categoryText = normalizeText([post.category, post.categorySlug].join(' '));
        return topicFilters.some((topic) => categoryText.includes(normalizeText(topic)));
      });
    }

    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) {
      return posts;
    }

    return posts.filter((post) => normalizeText([post.title, post.summary, post.excerpt, post.authorName].join(' ')).includes(normalizedKeyword));
  }, [blogPosts, keyword, selectedCategory, topicFilters]);

  const totalPages = Math.ceil(filteredPosts.length / pageSize) || 1;

  const featuredPosts = useMemo(() => filteredPosts.slice(0, 3), [filteredPosts]);
  const latestPosts = useMemo(() => filteredPosts.slice(0, 5), [filteredPosts]);
  const featuredPostIds = useMemo(() => new Set(featuredPosts.map((post) => post.id)), [featuredPosts]);

  const currentPosts = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filteredPosts
      .filter((post) => !featuredPostIds.has(post.id))
      .slice(startIndex, startIndex + pageSize);
  }, [featuredPostIds, filteredPosts, page]);

  useEffect(() => {
    setPage(1);
  }, [selectedTopic, selectedCategory, keyword]);

  const activeHeading = selectedCategory
    ? categories.find((category) => category.slug === selectedCategory)?.name || 'Chuyên mục'
    : selectedTopic ? 'Bài viết theo chủ đề' : 'Tin tức Board Game mới nhất';

  return (
    <section className="card-surface blog-page">
      <div className="section-heading blog-heading">
        <div>
          <p className="eyebrow section-title-line">Blog BoardGame</p>
          <h2>{activeHeading}</h2>
          <p>Cập nhật luật chơi, mẹo chơi, đánh giá và chương trình khuyến mãi mới nhất.</p>
        </div>
      </div>

      <div className="blog-toolbar">
        <input
          className="blog-search-input"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="Tìm kiếm bài viết theo tiêu đề, nội dung..."
        />
        <div className="blog-category-list" role="list" aria-label="Danh sách chuyên mục blog">
          <Link className={`blog-category-chip ${!selectedCategory ? 'active' : ''}`} to={selectedTopic ? `/blog?topic=${selectedTopic}` : '/blog'}>
            Tất cả
          </Link>
          {categories.map((category) => (
            <Link
              key={category.slug}
              className={`blog-category-chip ${selectedCategory === category.slug ? 'active' : ''}`}
              to={`/blog?category=${category.slug}`}
            >
              {category.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="blog-highlight-grid">
        {featuredPosts.map((post) => (
          <article className="blog-highlight-card" key={post.id}>
            <img src={post.coverImage || '/image/catan.jpg'} alt={post.title} loading="lazy" />
            <div className="blog-highlight-body">
              <span className="blog-category">{post.category}</span>
              <h3>{post.title}</h3>
              <p>{getBlogPreviewText(post)}</p>
              <div className="blog-meta-row">
                <span>{formatBlogDate(post.date || post.publishedAt || post.createdAt || post.updatedAt)}</span>
                <span>{post.authorName || 'Nhân viên biên tập'}</span>
                <span>{Number(post.views || 0).toLocaleString('vi-VN')} lượt xem</span>
              </div>
              <Link className="primary-button" to={`/blog/${post.slug}`}>Đọc tiếp</Link>
            </div>
          </article>
        ))}
      </div>

      <div className="blog-page-grid">
        {currentPosts.map((post) => (
          <article className="blog-page-card" key={post.id}>
            <img src={post.coverImage || '/image/catan.jpg'} alt={post.title} loading="lazy" />
            <span className="blog-category">{post.category}</span>
            <span className="blog-date">{formatBlogDate(post.date || post.publishedAt || post.createdAt || post.updatedAt)}</span>
            <h3>{post.title}</h3>
            <p>{getBlogPreviewText(post)}</p>
            <p className="blog-card-meta">{post.authorName || 'Nhân viên biên tập'} · {Number(post.views || 0).toLocaleString('vi-VN')} lượt xem</p>
            <Link className="secondary-button" to={`/blog/${post.slug}`}>Đọc tiếp</Link>
          </article>
        ))}
      </div>

      <aside className="blog-latest-box">
        <h3>Bài viết mới nhất</h3>
        <ul>
          {latestPosts.map((post) => (
            <li key={`latest-${post.id}`}>
              <Link to={`/blog/${post.slug}`}>{post.title}</Link>
              <span>{formatBlogDate(post.date || post.publishedAt || post.createdAt || post.updatedAt)}</span>
            </li>
          ))}
        </ul>
      </aside>

      <div className="blog-pagination" aria-label="Phân trang blog">
        <button className="ghost-button" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
          Trang trước
        </button>
        <span>Trang {page} / {totalPages}</span>
        <button className="ghost-button" type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>
          Trang sau
        </button>
      </div>
    </section>
  );
}

export default Blog;
