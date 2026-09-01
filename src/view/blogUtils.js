export function getBlogPreviewText(post) {
  const source = String(post?.summary || post?.excerpt || post?.content || '').trim();
  if (!source) {
    return 'Bài viết cập nhật mới nhất về board game và trải nghiệm chơi game.';
  }

  const cleaned = source.replace(/\s+/g, ' ').trim();
  const maxLength = 150;

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  const shortened = cleaned.slice(0, maxLength).trim();
  const lastSpace = shortened.lastIndexOf(' ');
  const safeText = lastSpace > 40 ? shortened.slice(0, lastSpace) : shortened;

  return `${safeText.replace(/[.,;:!?]+$/g, '').trim()}...`;
}

export function formatBlogDate(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const rawValue = String(value).trim();
  if (!rawValue) {
    return '—';
  }

  const directDate = new Date(rawValue);
  if (!Number.isNaN(directDate.getTime())) {
    return directDate.toLocaleDateString('vi-VN');
  }

  const isoMatch = rawValue.match(/(\d{1,2})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{4})/);
  if (isoMatch) {
    const [, day, month, year] = isoMatch;
    const normalized = new Date(Number(year), Number(month) - 1, Number(day));
    return normalized.toLocaleDateString('vi-VN');
  }

  const legacyMatch = rawValue.match(/(\d{1,2})\s*THÁNG\s*(\d{1,2}),\s*(\d{4})/i);
  if (legacyMatch) {
    const [, day, month, year] = legacyMatch;
    const normalized = new Date(Number(year), Number(month) - 1, Number(day));
    return normalized.toLocaleDateString('vi-VN');
  }

  return rawValue;
}

export function getBlogDateText(post) {
  return formatBlogDate(post?.date || post?.publishedAt || post?.createdAt || post?.updatedAt || '');
}
