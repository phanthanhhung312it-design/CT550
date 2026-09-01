export function parsePlayersRange(value) {
  if (!value && value !== 0) {
    return { min: 1, max: Infinity };
  }

  const text = String(value).trim();
  if (!text) {
    return { min: 1, max: Infinity };
  }

  const normalized = text.replace(/\s+/g, '').toLowerCase();
  const direct = normalized.match(/^(\d+)$/);
  if (direct) {
    const players = Number(direct[1]);
    return { min: players, max: players };
  }

  const range = normalized.match(/^(\d+)-(\d+)$/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return { min, max };
  }

  const slash = normalized.match(/^(\d+)\/(\d+)$/);
  if (slash) {
    const min = Number(slash[1]);
    const max = Number(slash[2]);
    return { min, max };
  }

  const dash = normalized.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (dash) {
    const min = Number(dash[1]);
    const max = Number(dash[2]);
    return { min, max };
  }

  const single = normalized.match(/^(\d+)\+$/);
  if (single) {
    const min = Number(single[1]);
    return { min, max: Infinity };
  }

  return { min: 1, max: Infinity };
}

export function matchesPlayerCount(product, targetPlayers) {
  if (!product || !Number.isFinite(Number(targetPlayers))) {
    return false;
  }

  const { min, max } = parsePlayersRange(product?.players ?? product?.playerCount ?? product?.playersCount ?? product?.sp_songuoichoi);
  return Number(targetPlayers) >= min && Number(targetPlayers) <= max;
}

export function sortByNewestFirst(products) {
  return [...(Array.isArray(products) ? products : [])].sort((left, right) => {
    const leftTime = new Date(left?.createdAt || left?.created_at || left?.publishedAt || 0).getTime();
    const rightTime = new Date(right?.createdAt || right?.created_at || right?.publishedAt || 0).getTime();
    return rightTime - leftTime;
  });
}
