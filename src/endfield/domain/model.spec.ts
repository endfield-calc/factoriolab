import {
  resourceFromObjectiveId,
  resourceIds,
  resourceObjectiveId,
} from './model';

describe('resourceFromObjectiveId', () => {
  it('accepts exactly the six source objective IDs', () => {
    for (const id of resourceIds)
      expect(resourceFromObjectiveId(resourceObjectiveId(id))).toBe(id);
    for (const id of [
      undefined,
      '',
      'iron_ore',
      'resource:iron_ore',
      'ef:limit:iron_ore',
      'ef:resource:unknown',
      'ef:resource:iron_ore:extra',
      'prefix:ef:resource:iron_ore',
    ])
      expect(resourceFromObjectiveId(id)).toBeUndefined();
  });
});
