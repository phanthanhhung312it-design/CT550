function isImageSource(value) {
  return typeof value === 'string' && (/^https?:\/\//i.test(value) || value.startsWith('/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(value));
}

function ProductArtwork({ product, className = '', imageClassName = '' }) {
  const source = product?.image;

  if (isImageSource(source)) {
    return (
      <div className={className}>
        <img className={imageClassName} src={source} alt={product?.name ? `${product.name} board game` : 'Board game'} loading="lazy" />
      </div>
    );
  }

  return (
    <div className={className} aria-hidden="true">
      {source}
    </div>
  );
}

export default ProductArtwork;