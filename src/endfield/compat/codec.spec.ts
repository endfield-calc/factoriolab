import rawData from '/public/data/aef/data.json';
import { EnergyType } from '~/data/schema/energy-type';
import { ModData } from '~/data/schema/mod-data';
import { createEndfieldState, resourceOwner } from '~/endfield/domain/model';
import { WorkspaceRestoreError } from '~/extensions/state-extension';
import { Rational, rational } from '~/rational/rational';

import { decodeEndfield, encodeEndfield } from './codec';

const data = rawData as unknown as ModData;
// This synthetic extension gives the real copper mining recipe a machine that
// supports fuel, modules and beacons; fixed aef has no such entities.
const supportedData: ModData = {
  ...data,
  items: [
    ...data.items.map((item) =>
      item.id === 'miner_4'
        ? {
            ...item,
            machine: {
              ...item.machine,
              type: EnergyType.Burner,
              fuelTypes: ['test-fuel-type'],
              modules: 2,
            },
          }
        : item,
    ),
    {
      id: 'test-fuel',
      name: 'Fuel',
      fuel: { types: ['test-fuel-type'], value: 1 },
    },
    { id: 'test-module', name: 'Module', module: { speed: 1 } },
    {
      id: 'test-beacon',
      name: 'Beacon',
      beacon: { effectivity: 1, modules: 2 },
    },
  ],
};
function payload(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function expectDiagnostic(
  action: () => unknown,
  field: string,
  code = 'invalid-endfield-state',
): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(WorkspaceRestoreError);
  if (thrown instanceof WorkspaceRestoreError)
    expect(thrown.diagnostics).toEqual([
      jasmine.objectContaining({ field, code, severity: 'error' }),
    ]);
}

describe('Endfield ef codec', () => {
  it('rejects zero recipe speed before a resource workspace can be committed', () => {
    expect(() =>
      decodeEndfield(
        payload({
          version: 1,
          resourceLimits: { enabled: true, rates: { originium_ore: '1' } },
          resourceRecipeSettings: { originium_ore: { overclock: '0' } },
        }),
        data,
      ),
    ).toThrowError(WorkspaceRestoreError, /overclock must be positive/);
  });
  it('distinguishes disabled from enabled zero, fills only omitted defaults', () => {
    const defaults = createEndfieldState();
    const disabled = decodeEndfield(encodeEndfield(defaults), data);
    const enabled = decodeEndfield(
      payload({ version: 1, resourceLimits: { enabled: true } }),
      data,
    );
    expect(disabled.resourceLimits.enabled).toBeFalse();
    expect(enabled.resourceLimits.enabled).toBeTrue();
    expect(enabled.resourceLimits.rates).toEqual(defaults.resourceLimits.rates);
    expect(enabled.machineLimits).toEqual(defaults.machineLimits);
    expect(enabled.electric).toEqual(rational.one);
    expect(encodeEndfield(enabled)).not.toBe(encodeEndfield(disabled));
  });

  it('fills omitted enabled flags while retaining an explicit recipe cost without a machine', () => {
    const state = decodeEndfield(
      payload({
        version: 1,
        resourceLimits: { rates: { iron_ore: '3' } },
        machineLimits: { limits: { xiranite_oven_1: '2' } },
        transfer: { source: 'tundra' },
        resourceRecipeSettings: { iron_ore: { cost: '-2' } },
      }),
      data,
    );
    expect(state.resourceLimits.enabled).toBeFalse();
    expect(state.machineLimits.enabled).toBeFalse();
    expect(state.transfer.enabled).toBeFalse();
    expect(state.resourceLimits.rates.iron_ore).toEqual(rational(3));
    expect(state.machineLimits.limits['xiranite_oven_1']).toEqual(rational(2));
    expect(state.resourceRecipeSettings.iron_ore).toEqual({
      cost: rational(-2),
    });
    expect(decodeEndfield(encodeEndfield(state), data)).toEqual(state);
  });

  it('round trips exact rates, real settings and owners with stable encoding', () => {
    const defaults = createEndfieldState();
    const state = {
      ...defaults,
      resourceLimits: {
        enabled: true,
        rates: {
          ...defaults.resourceLimits.rates,
          copper_ore: rational(17, 3),
        },
      },
      resourceRecipeSettings: {
        copper_ore: {
          machineId: 'miner_4',
          overclock: rational(125),
          modules: [{ id: '', count: rational.one }],
        },
      },
      checkedDerived: new Set([resourceOwner('copper_ore')]),
      electric: rational(7, 9),
    };
    const encoded = encodeEndfield(state);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeEndfield(encoded, data)).toEqual(state);
    expect(encodeEndfield(decodeEndfield(encoded, data))).toBe(encoded);
  });

  it('round trips negative, zero and exact fractional recipe costs', () => {
    for (const cost of [
      rational(-30),
      rational.zero,
      new Rational(-9007199254740993n, 7n),
    ]) {
      const state = {
        ...createEndfieldState(),
        resourceRecipeSettings: { copper_ore: { machineId: 'miner_4', cost } },
      };
      const encoded = encodeEndfield(state);
      const restored = decodeEndfield(encoded, data);
      expect(restored.resourceRecipeSettings.copper_ore?.cost).toEqual(cost);
      expect(encodeEndfield(restored)).toBe(encoded);
    }
    const decimal = decodeEndfield(
      payload({
        version: 1,
        resourceRecipeSettings: { copper_ore: { cost: '-1.25e-2' } },
      }),
      data,
    );
    expect(decimal.resourceRecipeSettings.copper_ore?.cost).toEqual(
      rational(-1, 80),
    );
  });

  it('handles UTF-8 entity IDs in a valid dataset', () => {
    const localized = '采矿机🌏';
    const unicodeData: ModData = {
      ...data,
      items: [...data.items, { id: localized, name: localized, machine: {} }],
      recipes: data.recipes.map((recipe) =>
        recipe.id === 'originium_ore'
          ? { ...recipe, producers: [...(recipe.producers ?? []), localized] }
          : recipe,
      ),
    };
    const state = {
      ...createEndfieldState(),
      resourceRecipeSettings: { originium_ore: { machineId: localized } },
    };
    expect(decodeEndfield(encodeEndfield(state), unicodeData)).toEqual(state);
  });

  it('rejects invalid base64, UTF-8, JSON shapes and unexpected fields with a location', () => {
    const invalidUtf8 = btoa(String.fromCharCode(0xc3, 0x28)).replace(
      /=+$/,
      '',
    );
    const invalidJson = btoa('{').replace(/=+$/, '');
    for (const input of [
      undefined,
      null,
      3,
      '',
      'a',
      '%!',
      'YQ==',
      invalidUtf8,
      invalidJson,
      // The low padding bits differ from canonical eyJ2ZXJzaW9uIjoxfQ.
      'eyJ2ZXJzaW9uIjoxfR',
      'eyJ2ZXJzaW9uIjoxfS',
      'eyJ2ZXJzaW9uIjoxfT',
    ])
      expectDiagnostic(() => decodeEndfield(input, data), 'ef');
    for (const value of [null, [], 3, 'value'])
      expectDiagnostic(() => decodeEndfield(payload(value), data), 'ef');
    for (const [value, field] of [
      [{ version: 1, unknown: 1 }, 'ef.unknown'],
      [{ version: 1, resourceLimits: null }, 'ef.resourceLimits'],
      [{ version: 1, machineLimits: [] }, 'ef.machineLimits'],
      [{ version: 1, transfer: { enabled: 'true' } }, 'ef.transfer.enabled'],
      [
        { version: 1, resourceRecipeSettings: { copper_ore: [] } },
        'ef.resourceRecipeSettings.copper_ore',
      ],
      [
        { version: 1, checkedDerived: 'resource:iron_ore' },
        'ef.checkedDerived',
      ],
      [
        {
          version: 1,
          checkedDerived: ['resource:iron_ore', 'resource:iron_ore'],
        },
        'ef.checkedDerived',
      ],
      [{ version: 1, checkedDerived: [false] }, 'ef.checkedDerived'],
      [
        {
          version: 1,
          machineLimits: { enabled: false, limits: { other: '1' } },
        },
        'ef.machineLimits.limits.other',
      ],
      [
        { version: 1, resourceLimits: { rates: { iron_ore: 1 } } },
        'ef.resourceLimits.rates.iron_ore',
      ],
      [
        { version: 1, resourceRecipeSettings: { copper_ore: { unknown: 1 } } },
        'ef.resourceRecipeSettings.copper_ore.unknown',
      ],
    ] as const)
      expectDiagnostic(() => decodeEndfield(payload(value), data), field);
    for (const version of [undefined, null, '1', 1.5])
      expectDiagnostic(
        () => decodeEndfield(payload({ version }), data),
        'ef.version',
      );
    expectDiagnostic(
      () => decodeEndfield(payload({ version: 2 }), data),
      'ef.version',
      'unsupported-endfield-version',
    );
  });

  it('keeps large fractions exact and rejects malformed or out-of-domain rates', () => {
    const restored = decodeEndfield(
      payload({
        version: 1,
        resourceLimits: {
          enabled: true,
          rates: {
            iron_ore: '900719925474099312345/7',
            copper_ore: '12.5e2',
            gas_inert: '1e-8',
          },
        },
        machineLimits: { enabled: true, limits: { xiranite_oven_1: '0' } },
        transfer: { enabled: true, source: 'tundra' },
        electric: '0',
      }),
      data,
    );
    expect(restored.resourceLimits.rates.iron_ore).toEqual(
      new Rational(900719925474099312345n, 7n),
    );
    expect(restored.resourceLimits.rates.copper_ore).toEqual(rational(1250));
    expect(restored.resourceLimits.rates.gas_inert).toEqual(
      new Rational(1n, 100000000n),
    );
    expect(restored.machineLimits.limits['xiranite_oven_1']).toEqual(
      rational.zero,
    );
    expect(restored.transfer.enabled).toBeTrue();
    expect(restored.electric).toEqual(rational.zero);
    for (const value of ['', 'abc', '1/0', '-1'])
      expectDiagnostic(
        () => decodeEndfield(payload({ version: 1, electric: value }), data),
        'ef.electric',
      );
    for (const value of ['1e10001', '1e-10001'])
      expectDiagnostic(
        () => decodeEndfield(payload({ version: 1, electric: value }), data),
        'ef.electric',
        'numeric-limit',
      );
    for (const value of ['0', '-1'])
      expectDiagnostic(
        () =>
          decodeEndfield(
            payload({
              version: 1,
              resourceRecipeSettings: { copper_ore: { overclock: value } },
            }),
            data,
          ),
        'ef.resourceRecipeSettings.copper_ore.overclock',
      );
  });

  it('round trips supported machine, fuel, module and beacon settings without sharing their arrays', () => {
    const settings = {
      machineId: 'miner_4',
      fuelId: 'test-fuel',
      modules: [
        { id: 'test-module', count: rational(2) },
        { count: rational.one },
      ],
      beacons: [
        {
          id: 'test-beacon',
          count: rational(3),
          total: rational(7, 2),
          modules: [{ id: 'test-module', count: rational.one }, {}],
        },
        {},
      ],
      overclock: rational(125),
      productivity: rational(2),
      cost: rational(-30),
    };
    const encoded = encodeEndfield({
      ...createEndfieldState(),
      resourceRecipeSettings: { copper_ore: settings },
    });
    const decoded = decodeEndfield(encoded, supportedData);
    expect(decoded.resourceRecipeSettings.copper_ore).toEqual(settings);
    expect(decoded.resourceRecipeSettings.copper_ore?.modules).not.toBe(
      settings.modules,
    );
    expect(
      decoded.resourceRecipeSettings.copper_ore?.beacons?.[0].modules,
    ).not.toBe(settings.beacons[0].modules);
    settings.modules[0].id = 'changed';
    expect(decoded.resourceRecipeSettings.copper_ore?.modules?.[0].id).toBe(
      'test-module',
    );
    expect(encodeEndfield(decoded)).toBe(encoded);
  });

  it('diagnoses invalid producer, nested entity and count references', () => {
    for (const [settings, field] of [
      [{ machineId: 'miner_2' }, 'machineId'],
      [{ machineId: 'unknown' }, 'machineId'],
      [{ fuelId: 'unknown' }, 'fuelId'],
      [{ modules: 'invalid' }, 'modules'],
      [{ modules: [{ id: 'unknown' }] }, 'modules.0.id'],
      [{ modules: [{ id: 'test-module', count: '-1' }] }, 'modules.0.count'],
      [{ beacons: 'invalid' }, 'beacons'],
      [{ beacons: [{ id: 'unknown' }] }, 'beacons.0.id'],
      [{ beacons: [{ id: 'test-beacon', total: '-1' }] }, 'beacons.0.total'],
      [
        { beacons: [{ id: 'test-beacon', modules: [{ id: 'unknown' }] }] },
        'beacons.0.modules.0.id',
      ],
    ] as const)
      expectDiagnostic(
        () =>
          decodeEndfield(
            payload({
              version: 1,
              resourceRecipeSettings: { copper_ore: settings },
            }),
            supportedData,
          ),
        `ef.resourceRecipeSettings.copper_ore.${field}`,
      );
  });

  it('rejects malformed encodings, unsupported versions and invalid fields', () => {
    const inputs = [
      '%',
      'eA',
      payload({ version: 2 }),
      payload({ version: 1, resourceLimits: { enabled: 1 } }),
      payload({ version: 1, resourceLimits: { rates: { other: '1' } } }),
      payload({ version: 1, resourceLimits: { rates: { copper_ore: '1/0' } } }),
      payload({ version: 1, electric: '-1' }),
      payload({ version: 1, resourceLimits: { rates: { copper_ore: '-1' } } }),
      payload({
        version: 1,
        resourceRecipeSettings: { copper_ore: { cost: '-1/0' } },
      }),
      payload({ version: 1, machineLimits: { limits: { miner_4: '1' } } }),
      payload({ version: 1, transfer: { source: 'jinlong' } }),
      payload({ version: 1, checkedDerived: ['resource:unknown'] }),
      payload({
        version: 1,
        resourceRecipeSettings: { copper_ore: { machineId: 'miner_2' } },
      }),
      payload({
        version: 1,
        resourceRecipeSettings: { copper_ore: { fuelId: 'missing' } },
      }),
    ];
    for (const input of inputs)
      expect(() => decodeEndfield(input, data)).toThrowError(
        WorkspaceRestoreError,
      );
  });

  it('distinguishes an unknown version from malformed data', () => {
    for (const [input, code] of [
      [payload({ version: 2 }), 'unsupported-endfield-version'],
      [payload({ version: '1' }), 'invalid-endfield-state'],
    ]) {
      try {
        decodeEndfield(input, data);
        fail('Expected a restore error');
      } catch (error) {
        expect((error as WorkspaceRestoreError).diagnostics[0].code).toBe(code);
      }
    }
  });
});
