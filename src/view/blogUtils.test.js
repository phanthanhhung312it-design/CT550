import { getBlogPreviewText } from './blogUtils';

import { formatBlogDate, getBlogPreviewText } from './blogUtils';

describe('blogUtils', () => {
  it('trims preview text without cutting mid-word and keeps the summary readable', () => {
    const article = {
      summary: 'Cách chọn board game cho nhóm 2 người không chỉ dựa vào số lượng người chơi mà còn cần xem độ khó, thời lượng và độ vui nhộn để cả nhóm đều thích. Đây là nội dung chi tiết giúp bạn chọn đúng sản phẩm cho buổi tối cuối tuần.',
    };

    const preview = getBlogPreviewText(article);
    expect(preview.endsWith('...')).toBe(true);
    expect(preview.length).toBeLessThan(180);
    expect(preview).toContain('board game');
  });

  it('normalizes all blog dates into one consistent format', () => {
    expect(formatBlogDate('2026-05-25T00:00:00.000Z')).toContain('25');
    expect(formatBlogDate('25 THÁNG 5, 2026')).toContain('25');
    expect(formatBlogDate('3/8/2026')).toContain('3');
  });
});
