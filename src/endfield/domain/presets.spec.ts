import { rational } from '~/rational/rational';

import { createEndfieldState, ovenId, resourceOwner } from './model';
import { applyEndfieldAction, EndfieldSettingsSnapshot } from './presets';

describe('Endfield resource actions', () => {
  const settings: EndfieldSettingsSnapshot = {
    defaultLocationIds: new Set(['tundra', 'jinlong']),
    excludedRecipeIds: new Set([
      'unrelated',
      'sewage-treat',
      'sewage-treat-export',
    ]),
  };

  it('creates independent defaults with disabled limits, zero rates, and twelve ovens', () => {
    const first = createEndfieldState();
    const second = createEndfieldState();
    expect(first.resourceLimits.enabled).toBeFalse();
    expect(
      Object.values(first.resourceLimits.rates).every((r) => r.isZero()),
    ).toBeTrue();
    expect(first.machineLimits.enabled).toBeFalse();
    expect(first.machineLimits.limits[ovenId]).toEqual(rational(12));
    expect(first.transfer).toEqual({ enabled: false, source: 'tundra' });
    expect(first.electric).toEqual(rational.one);
    expect(first.checkedDerived).not.toBe(second.checkedDerived);
    expect(first.resourceLimits.rates).not.toBe(second.resourceLimits.rates);
  });

  it('applies tundra while retaining water exclusions and resets resource-owned state', () => {
    const initial = createEndfieldState();
    const original = {
      ...initial,
      electric: rational(2),
      resourceRecipeSettings: { originium_ore: { machineId: 'miner' } },
      checkedDerived: new Set([resourceOwner('originium_ore')]),
    };
    const result = applyEndfieldAction(
      original,
      { type: 'preset', preset: 'tundra' },
      settings,
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.state.resourceLimits.rates.originium_ore).toEqual(
      rational(560, 60),
    );
    expect(result.state.resourceLimits.rates.iron_ore).toEqual(
      rational(1080, 60),
    );
    expect(result.state.resourceLimits.rates.copper_ore).toEqual(rational.zero);
    expect(result.state.machineLimits.enabled).toBeFalse();
    expect(result.state.transfer.enabled).toBeFalse();
    expect(result.state.electric).toEqual(rational(2));
    expect(result.state.resourceRecipeSettings).toEqual({});
    expect(result.state.checkedDerived.size).toBe(0);
    expect(result.settings.locationIds).toEqual(new Set(['tundra']));
    expect(result.settings.excludedRecipeIds).toBeUndefined();
    expect(
      original.checkedDerived.has(resourceOwner('originium_ore')),
    ).toBeTrue();
    expect(original.resourceRecipeSettings.originium_ore.machineId).toBe(
      'miner',
    );
    expect(settings.excludedRecipeIds.size).toBe(3);
  });

  it('restores water for jinlong and clear while preserving other exclusions and electric', () => {
    const initial = { ...createEndfieldState(), electric: rational(3) };
    const jinlong = applyEndfieldAction(
      initial,
      { type: 'preset', preset: 'jinlong' },
      settings,
    );
    expect(jinlong.state.resourceLimits.rates.copper_ore).toEqual(
      rational(510, 60),
    );
    expect(jinlong.state.resourceLimits.rates.gas_inert).toEqual(
      rational(460, 60),
    );
    expect(jinlong.state.machineLimits).toEqual({
      enabled: true,
      limits: { [ovenId]: rational(12) },
    });
    expect(jinlong.state.transfer).toEqual({ enabled: true, source: 'tundra' });
    expect(jinlong.settings.locationIds).toEqual(new Set(['jinlong']));
    expect(jinlong.settings.excludedRecipeIds).toEqual(new Set(['unrelated']));
    const cleared = applyEndfieldAction(
      jinlong.state,
      { type: 'clear' },
      settings,
    );
    expect(cleared.state.electric).toEqual(rational(3));
    expect(cleared.state.resourceLimits.enabled).toBeFalse();
    expect(cleared.state.machineLimits.enabled).toBeFalse();
    expect(cleared.state.transfer.enabled).toBeFalse();
    expect(cleared.settings.locationIds).toEqual(settings.defaultLocationIds);
    expect(cleared.settings.locationIds).not.toBe(settings.defaultLocationIds);
    expect(cleared.settings.excludedRecipeIds).toEqual(new Set(['unrelated']));
  });

  it('preserves source settings when the rate changes and rejects invalid inputs', () => {
    const initial = {
      ...createEndfieldState(),
      resourceRecipeSettings: {
        iron_ore: { machineId: 'miner_3', overclock: rational(125) },
      },
    };
    const next = applyEndfieldAction(
      initial,
      { type: 'resourceRate', id: 'iron_ore', value: rational(5) },
      settings,
    );
    expect(next.state.resourceRecipeSettings).toEqual(
      initial.resourceRecipeSettings,
    );
    expect(initial.resourceLimits.rates.iron_ore).toEqual(rational.zero);
    const rejected = applyEndfieldAction(
      next.state,
      { type: 'machineLimit', id: ovenId, value: rational(-1) },
      settings,
    );
    expect(rejected.state).toBe(next.state);
    expect(rejected.diagnostics[0].code).toBe('invalid-value');
    const emptyId = applyEndfieldAction(
      next.state,
      { type: 'machineLimit', id: '', value: rational.one },
      settings,
    );
    expect(emptyId.diagnostics[0].code).toBe('invalid-id');
    const otherMachine = applyEndfieldAction(
      next.state,
      { type: 'machineLimit', id: 'liquid_clean_gate', value: rational.one },
      settings,
    );
    expect(otherMachine.state).toBe(next.state);
    expect(otherMachine.diagnostics[0].code).toBe('invalid-id');
  });

  it('changes only the two water exclusions', () => {
    const initial = createEndfieldState();
    const enabled = applyEndfieldAction(
      initial,
      { type: 'waterDisabled', disabled: false },
      settings,
    );
    expect(enabled.state).toBe(initial);
    expect(enabled.settings.excludedRecipeIds).toEqual(new Set(['unrelated']));
    const disabled = applyEndfieldAction(
      initial,
      { type: 'waterDisabled', disabled: true },
      { ...settings, excludedRecipeIds: enabled.settings.excludedRecipeIds! },
    );
    expect(disabled.settings.excludedRecipeIds).toEqual(
      settings.excludedRecipeIds,
    );
  });
  it('updates independent controls without changing earlier snapshots', () => {
    const start = createEndfieldState();
    const enabled = applyEndfieldAction(
      start,
      { type: 'resourceEnabled', enabled: true },
      settings,
    ).state;
    const machines = applyEndfieldAction(
      enabled,
      { type: 'machineEnabled', enabled: true },
      settings,
    ).state;
    const limited = applyEndfieldAction(
      machines,
      { type: 'machineLimit', id: ovenId, value: rational(8) },
      settings,
    ).state;
    const transferred = applyEndfieldAction(
      limited,
      { type: 'transfer', enabled: true, source: 'tundra' },
      settings,
    ).state;
    expect(start.resourceLimits.enabled).toBeFalse();
    expect(enabled.resourceLimits.enabled).toBeTrue();
    expect(machines.machineLimits.enabled).toBeTrue();
    expect(limited.machineLimits.limits[ovenId]).toEqual(rational(8));
    expect(transferred.transfer.enabled).toBeTrue();
  });

  it('rejects invalid presets, ids, rates and sources without changing either snapshot', () => {
    const state = createEndfieldState();
    const cases = [
      [{ type: 'preset', preset: 'unknown' }, 'invalid-preset'],
      [
        { type: 'resourceRate', id: 'unknown', value: rational.one },
        'invalid-id',
      ],
      [
        { type: 'resourceRate', id: 'iron_ore', value: rational(-1) },
        'invalid-value',
      ],
      [{ type: 'resourceRate', id: 'iron_ore', value: 'bad' }, 'invalid-value'],
      [
        { type: 'machineLimit', id: ovenId, value: rational(-1) },
        'invalid-value',
      ],
      [
        { type: 'machineLimit', id: 'unknown', value: rational.one },
        'invalid-id',
      ],
      [
        { type: 'transfer', enabled: true, source: 'jinlong' },
        'invalid-source',
      ],
    ] as const;
    for (const [action, code] of cases) {
      const result = applyEndfieldAction(
        state,
        action as unknown as Parameters<typeof applyEndfieldAction>[1],
        settings,
      );
      expect(result.state).toBe(state);
      expect(result.settings).toEqual({});
      expect(result.diagnostics[0].code).toBe(code);
    }
    expect(settings.excludedRecipeIds.size).toBe(3);
  });
});
