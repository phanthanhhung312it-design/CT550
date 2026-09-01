import { matchesPlayerCount, sortByNewestFirst } from './homeFilters';

describe('homeFilters', () => {
  it('matches only true 2-player fits and ignores unrelated ranges', () => {
    expect(matchesPlayerCount({ players: '2' }, 2)).toBe(true);
    expect(matchesPlayerCount({ players: '1-2' }, 2)).toBe(true);
    expect(matchesPlayerCount({ players: '2-4' }, 2)).toBe(true);
    expect(matchesPlayerCount({ players: '4-12' }, 2)).toBe(false);
    expect(matchesPlayerCount({ players: '3-5' }, 2)).toBe(false);
  });

  it('sorts newest products first based on createdAt timestamps', () => {
    const products = [
      { id: 1, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 2, createdAt: '2026-03-10T00:00:00.000Z' },
      { id: 3, createdAt: '2026-02-05T00:00:00.000Z' },
    ];

    expect(sortByNewestFirst(products).map((product) => product.id)).toEqual([2, 3, 1]);
  });
});
