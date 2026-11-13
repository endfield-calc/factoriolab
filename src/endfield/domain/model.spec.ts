import { rational } from '~/rational/rational';

import { copyResourceRecipeSettings } from './model';

describe('copyResourceRecipeSettings', () => {
  it('copies beacons with and without nested modules when machine modules are absent', () => {
    const source = {
      machineId: 'machine',
      beacons: [
        { id: 'plain-beacon' },
        { id: 'module-beacon', modules: [{ id: 'speed', count: rational(2) }] },
      ],
    };
    const copy = copyResourceRecipeSettings(source);
    expect(copy.modules).toBeUndefined();
    expect(copy.beacons).toEqual(source.beacons);
    expect(copy.beacons).not.toBe(source.beacons);
    expect(copy.beacons?.[0]).not.toBe(source.beacons[0]);
    expect(copy.beacons?.[1].modules).not.toBe(source.beacons[1].modules);
    source.beacons[0].id = 'changed';
    const nested = source.beacons[1].modules;
    if (nested) nested[0].id = 'changed-module';
    expect(copy.beacons?.[0].id).toBe('plain-beacon');
    expect(copy.beacons?.[1].modules?.[0].id).toBe('speed');
  });
});
