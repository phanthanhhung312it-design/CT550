const { Schema, model } = require('mongoose');

const blogPostSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true },
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    category: { type: String, required: true },
    categorySlug: { type: String, default: '' },
    excerpt: { type: String, required: true },
    summary: { type: String, default: '' },
    content: { type: String, default: '' },
    coverImage: { type: String, default: '/image/catan.jpg' },
    authorName: { type: String, default: 'Nhân viên biên tập' },
    authorEmployeeId: { type: Number, default: null },
    views: { type: Number, default: 0 },
    status: { type: String, default: 'published' },
    isVisible: { type: Boolean, default: true },
    date: { type: String, default: '' },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, minimize: false }
);

module.exports = model('BlogPost', blogPostSchema);
