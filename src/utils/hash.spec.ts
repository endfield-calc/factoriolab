import { ItemId } from '~/tests/item-id';
import { mockModData } from '~/tests/mocks/data';

import { addIfMissing, emptyModHash, updateHash } from './hash';

describe('addIfMissing', () => {
  it('should fill in null gaps', () => {
    const hash = emptyModHash();
    hash.items.push('a', null, 'c');
    addIfMissing(hash, 'items', 'b');
    expect(hash.items).toEqual(['a', 'b', 'c']);
  });
});

describe('updateHash', () => {
  it('reserves retired IDs and null slots for append-only protocols on repeated updates', () => {
    const hash = emptyModHash();
    hash.items = ['retired', null, ItemId.WoodenChest];
    hash.recipes = ['retired-recipe', null];
    updateHash(mockModData, hash, 'append-only');
    expect(hash.items.slice(0, 3)).toEqual([
      'retired',
      null,
      ItemId.WoodenChest,
    ]);
    expect(hash.recipes.slice(0, 2)).toEqual(['retired-recipe', null]);
    expect(hash.items.filter((id) => id === ItemId.WoodenChest).length).toBe(1);
    const first = JSON.stringify(hash);
    updateHash(mockModData, hash, 'append-only');
    expect(JSON.stringify(hash)).toBe(first);
  });

  it('should update hash including quality items', () => {
    const data = {
      ...mockModData,
      qualities: [
        { id: 'normal', name: 'Normal', level: 0 },
        { id: 'uncommon', name: 'Uncommon', level: 1 },
      ],
    };
    const hash = emptyModHash();
    hash.items.push('nonsense', ItemId.WoodenChest);
    updateHash(data, hash);
    expect(hash.items.length).toBeGreaterThan(data.items.length);
    expect(hash.recipes.length).toBeGreaterThan(data.recipes.length);
    expect(hash.items.includes('nonsense')).toBeFalse();
  });
});
