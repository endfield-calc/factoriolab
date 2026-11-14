import { TestBed } from '@angular/core/testing';

import rawData from '/public/data/aef/data.json';
import { ModData } from '~/data/schema/mod-data';
import { createEndfieldState, resourceOwner } from '~/endfield/domain/model';
import { Rational, rational } from '~/rational/rational';
import { Zip } from '~/state/router/zip';

import {
  decodeEndfield,
  encodeEndfield,
  validateRecipeReferences,
} from './codec';

const data = rawData as unknown as ModData;
function payload(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function expectRestoreError(action: () => unknown, context: string): void {
  expect(action).withContext(context).toThrowError(Error);
}

describe('Endfield ef codec', () => {
  it('rejects machine overrides for producerless settlement recipes', () => {
    for (const id of [
      'tundra_coupon-glass_bottle',
      'jinlong_coupon-copper_cmpt',
    ]) {
      const recipe = data.recipes.find((entry) => entry.id === id)!;
      expect(recipe.producers).toBeUndefined();
      for (const machineId of [
        'settlement-tundra_coupon',
        'settlement-jinlong_coupon',
        'miner_2',
      ])
        expectRestoreError(() => {
          validateRecipeReferences({ machineId }, data, 'recipe', id);
        }, 'recipe.machineId');
    }
  });
  it('allows the native empty module slot and rejects an unknown module on ordinary recipes', () => {
    expect(() => {
      validateRecipeReferences(
        { modules: [{ id: '' }] },
        data,
        'ordinary',
        'copper_ore',
      );
    }).not.toThrow();
    expectRestoreError(() => {
      validateRecipeReferences(
        { modules: [{ id: 'missing-module' }] },
        data,
        'ordinary',
        'copper_ore',
      );
    }, 'ordinary.modules.0.id');
  });
  it('reads each whitelisted resource setting once and retains its captured value', () => {
    let reads = 0;
    const settings = Object.defineProperty({}, 'originium_ore', {
      enumerable: true,
      get: () => (++reads === 1 ? { overclock: rational(125) } : undefined),
    });
    const restored = decodeEndfield(
      encodeEndfield({
        ...createEndfieldState(),
        resourceRecipeSettings: settings,
      }),
      data,
    );
    expect(reads).toBe(1);
    expect(
      restored.resourceRecipeSettings.originium_ore?.overclock?.eq(
        rational(125),
      ),
    ).toBeTrue();
  });
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
    ).toThrowError(Error, /overclock must be positive/);
  });
  it('distinguishes disabled from enabled zero, fills only omitted defaults', () => {
    const defaults = createEndfieldState();
    expect(decodeEndfield(undefined, data)).toEqual(defaults);
    expect(decodeEndfield(null, data)).toEqual(defaults);
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

  it('fills omitted enabled flags while retaining a source overclock without a machine', () => {
    const state = decodeEndfield(
      payload({
        version: 1,
        resourceLimits: { rates: { iron_ore: '3' } },
        machineLimits: { limits: { xiranite_oven_1: '2' } },
        transfer: { source: 'tundra' },
        resourceRecipeSettings: { iron_ore: { overclock: '125' } },
      }),
      data,
    );
    expect(state.resourceLimits.enabled).toBeFalse();
    expect(state.machineLimits.enabled).toBeFalse();
    expect(state.transfer.enabled).toBeFalse();
    expect(state.resourceLimits.rates.iron_ore).toEqual(rational(3));
    expect(state.machineLimits.limits['xiranite_oven_1']).toEqual(rational(2));
    expect(state.resourceRecipeSettings.iron_ore).toEqual({
      overclock: rational(125),
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
      expectRestoreError(() => decodeEndfield(input, data), 'ef');
    for (const value of [null, [], 3, 'value'])
      expectRestoreError(() => decodeEndfield(payload(value), data), 'ef');
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
      expectRestoreError(() => decodeEndfield(payload(value), data), field);
    for (const version of [undefined, null, '1', 1.5])
      expectRestoreError(
        () => decodeEndfield(payload({ version }), data),
        'ef.version',
      );
    expectRestoreError(
      () => decodeEndfield(payload({ version: 2 }), data),
      'ef.version',
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
      expectRestoreError(
        () => decodeEndfield(payload({ version: 1, electric: value }), data),
        'ef.electric',
      );
    for (const value of [
      '1e10001',
      '1e-10001',
      '1e9007199254740992',
      '1.0e-10000',
    ])
      expect(() =>
        decodeEndfield(payload({ version: 1, electric: value }), data),
      ).toThrowError(
        Error,
        'Decimal shift exceeds the supported range at ef.electric',
      );
    for (const value of ['0', '-1'])
      expectRestoreError(
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

  it('diagnoses a non-producer or unknown machine reference', () => {
    for (const machineId of ['miner_2', 'unknown'])
      expectRestoreError(
        () =>
          decodeEndfield(
            payload({
              version: 1,
              resourceRecipeSettings: { copper_ore: { machineId } },
            }),
            data,
          ),
        'ef.resourceRecipeSettings.copper_ore.machineId',
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
      payload({ version: 1, machineLimits: { limits: { miner_4: '1' } } }),
      payload({ version: 1, transfer: { source: 'jinlong' } }),
      payload({ version: 1, checkedDerived: ['resource:unknown'] }),
      payload({
        version: 1,
        resourceRecipeSettings: { copper_ore: { machineId: 'miner_2' } },
      }),
    ];
    for (const input of inputs)
      expect(() => decodeEndfield(input, data)).toThrowError(Error);
  });

  it('distinguishes an unknown version from malformed data', () => {
    expect(() => decodeEndfield(payload({ version: 2 }), data)).toThrowError(
      Error,
      'Unsupported ef version: 2',
    );
    expect(() => decodeEndfield(payload({ version: '1' }), data)).toThrowError(
      Error,
      'Invalid ef version',
    );
  });
});

describe('Zip sparse hash ranges', () => {
  let service: Zip;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Zip);
  });
  it('compresses across null slots and breaks at unselected current IDs', () => {
    expect(
      service.zipDiffSubset(
        new Set(['a', 'c']),
        undefined,
        ['a', 'c'],
        ['a', null, 'c'],
      ),
    ).toEqual('A~C');
    expect(
      service.zipDiffSubset(
        new Set(['a', 'c']),
        undefined,
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
      ),
    ).toEqual('A*C');
  });
});

describe('Zip strict imports', () => {
  let service: Zip;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Zip);
  });

  it('rejects malformed, missing, and retired-null hash indices', () => {
    for (const token of ['?', 'B', 'C', 'AAAAAAAAAA'])
      expect(() => service.parseNString(token, ['one', null])).toThrowError(
        Error,
      );
    expect(() => service.parseNArray('A~?', ['one'])).toThrowError(Error);
    expect(() => service.parseIndices('0~2', [{}])).toThrowError(Error);
    expect(() => service.parseIndices('0~NaN', [{}])).toThrowError(Error);
    expect(() => service.parseIndices('0~-1', [{}])).toThrowError(Error);
  });

  it('validates subset endpoints and preserves all non-null slots in a sparse range', () => {
    expect(service.parseSubset('A~D', ['one', null, 'retired', 'two'])).toEqual(
      new Set(['one', 'retired', 'two']),
    );
    for (const token of ['B', 'A~E', 'D~A', 'A~C~D', 'A~?'])
      expect(() =>
        service.parseSubset(token, ['one', null, 'retired', 'two']),
      ).toThrowError(Error);
  });

  it('preserves the invalid short ID in the error message', () => {
    const read = service.get({ mmr: '?' })(service.parseArray.bind(service));
    expect(() => read('mmr', ['one'])).toThrowError(
      Error,
      'Invalid workspace index: ?',
    );
  });

  it('rejects malformed boolean and numeric settings with the original token', () => {
    const get = service.get({ orm: 'yes', omt: 'NaN' });
    const boolean = get(service.parseBool.bind(service));
    const number = get(service.parseNumber.bind(service));
    expect(() => boolean('orm')).toThrowError(
      Error,
      'Invalid workspace index: yes',
    );
    expect(() => number('omt')).toThrowError(
      Error,
      'Invalid workspace index: NaN',
    );
    expect(service.parseBool('0')).toBeFalse();
    expect(service.parseBool('1')).toBeTrue();
    expect(service.parseNumber('0')).toEqual(0);
  });

  it('propagates ordinary parsing errors without disguising them as index errors', () => {
    const read = service.get({ moc: '1/2/3' })(
      service.parseRational.bind(service),
    );
    expect(() => read('moc')).toThrowError('Too many /');
  });

  it('never writes an entity that is absent from its hash', () => {
    expect(() => service.zipNString('missing', ['one'])).toThrowError(Error);
    expect(() => service.zipDiffString('missing', '', ['one'])).toThrowError(
      Error,
    );
    expect(() => service.zipDiffArray(['missing'], [], ['one'])).toThrowError(
      Error,
    );
    expect(() =>
      service.zipDiffSubset(new Set(['missing']), undefined, ['one']),
    ).toThrowError(Error);
  });
});
