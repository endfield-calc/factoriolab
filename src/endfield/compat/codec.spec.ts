import { emptyModData, ModData } from '~/data/schema/mod-data';
import {
  createEndfieldState,
  EndfieldState,
  resourceIds,
  resourceRecipes,
} from '~/endfield/domain/model';
import { Rational, rational } from '~/rational/rational';

import { decodeEndfield, encodeEndfield } from './codec';

const escapedMachine = 'drill_!*~&=/%+中文';
const data: ModData = {
  ...emptyModData(),
  items: [
    { id: escapedMachine, name: 'Drill', machine: {} },
    { id: 'other-drill', name: 'Other drill', machine: {} },
  ],
  recipes: Object.values(resourceRecipes).map((id, index) => ({
    id,
    name: id,
    time: 1,
    in: {},
    out: {},
    producers: index === 0 ? [escapedMachine, 'other-drill'] : [escapedMachine],
  })),
};

describe('Endfield ef codec', () => {
  it('round trips the transfer source and reads older enabled flags as Tundra', () => {
    const state = {
      ...createEndfieldState(),
      transferEnabled: true,
      transferSource: 'jinlong',
    };
    expect(decodeEndfield(encodeEndfield(state))).toEqual(state);
    expect(decodeEndfield('4').transferEnabled).toBeTrue();
    expect(decodeEndfield('4').transferSource).toBe('tundra');
    expect(
      decodeEndfield(encodeEndfield({ ...state, transferEnabled: false })),
    ).toEqual({ ...state, transferEnabled: false });
  });
  it('round trips stage start times and disabled events independently of their display order', () => {
    const state = {
      ...createEndfieldState(),
      activityModes: { second: 'disabled', '活动~1': 1_778_000_000_000 },
    } as const;
    const encoded = encodeEndfield(state);
    expect(decodeEndfield(encoded)).toEqual(state);
    expect(
      encodeEndfield({
        ...state,
        activityModes: { '活动~1': 1_778_000_000_000, second: 'disabled' },
      }),
    ).toBe(encoded);
    for (const invalid of [
      '*****a~d~a~0',
      '*****a',
      '*****a~0.1',
      '*****a~9007199254740992',
    ])
      expect(() => decodeEndfield(invalid)).toThrowError();
  });
  it('omits default state and retains each enabled and checked bit', () => {
    const defaults = createEndfieldState();
    expect(encodeEndfield(defaults)).toBeUndefined();
    expect(decodeEndfield(undefined)).toEqual(defaults);
    expect(decodeEndfield(null)).toEqual(defaults);
    for (let flags = 0; flags < 8; flags++) {
      const state: EndfieldState = {
        ...defaults,
        resourceLimits: { ...defaults.resourceLimits, enabled: !!(flags & 1) },
        machineLimits: { ...defaults.machineLimits, enabled: !!(flags & 2) },
        transferEnabled: !!(flags & 4),
      };
      expect(decodeEndfield(encodeEndfield(state))).toEqual(state);
    }
    const checked: EndfieldState = {
      ...defaults,
      checkedDerived: new Set(['originium_ore', 'gas_inert']),
    };
    expect(decodeEndfield(encodeEndfield(checked))).toEqual(checked);
  });

  it('retains disabled inputs, independent sources, signed electricity and exact fractions', () => {
    const defaults = createEndfieldState();
    const state: EndfieldState = {
      ...defaults,
      resourceLimits: {
        enabled: false,
        rates: {
          ...defaults.resourceLimits.rates,
          originium_ore: new Rational(900719925474099312345n, 7n),
          copper_ore: rational(17, 3),
        },
      },
      machineLimits: {
        enabled: false,
        limits: { xiranite_oven_1: rational(5, 3) },
      },
      electric: rational(-7, 9),
      resourceRecipeSettings: {
        originium_ore: { machineId: 'other-drill', overclock: rational(125) },
        copper_ore: { machineId: escapedMachine, overclock: rational(7, 3) },
        gas_inert: { overclock: rational(3, 2) },
      },
      checkedDerived: new Set(['gas_inert', 'originium_ore']),
    };
    const encoded = encodeEndfield(state)!;
    expect(encoded).not.toMatch(/[&=%+]/);
    expect(decodeEndfield(encoded, data)).toEqual(state);
    expect(encodeEndfield(decodeEndfield(encoded, data))).toBe(encoded);
    const params = new URLSearchParams({ ef: encoded, v: '12' });
    expect(decodeEndfield(params.get('ef'), data)).toEqual(state);
    expect(
      decodeEndfield(
        new URL(`https://example.test/?${params}`).searchParams.get('ef'),
        data,
      ),
    ).toEqual(state);

    const zero = { ...state, electric: rational.zero };
    expect(decodeEndfield(encodeEndfield(zero), data)).toEqual(zero);
  });

  it('uses fixed resource positions independent of insertion order and omits empty settings', () => {
    const defaults = createEndfieldState();
    const first: EndfieldState = {
      ...defaults,
      resourceRecipeSettings: {
        originium_ore: { overclock: rational(125) },
        copper_ore: { machineId: escapedMachine },
        iron_ore: {},
      },
      checkedDerived: new Set(['gas_inert', 'originium_ore']),
    };
    const second: EndfieldState = {
      ...defaults,
      resourceRecipeSettings: {
        copper_ore: { machineId: escapedMachine },
        originium_ore: { overclock: rational(125) },
      },
      checkedDerived: new Set(['originium_ore', 'gas_inert']),
    };
    expect(encodeEndfield(first)).toBe(encodeEndfield(second));
    expect(decodeEndfield(encodeEndfield(first), data)).toEqual(second);
    expect(
      encodeEndfield({ ...defaults, resourceRecipeSettings: { iron_ore: {} } }),
    ).toBeUndefined();
  });

  it('round trips every resource position with distinct rates and source speeds', () => {
    const defaults = createEndfieldState();
    const rates = { ...defaults.resourceLimits.rates };
    const resourceRecipeSettings: EndfieldState['resourceRecipeSettings'] =
      Object.fromEntries(
        resourceIds.map((id, index) => {
          rates[id] = rational(index + 1, index + 2);
          return [
            id,
            { machineId: escapedMachine, overclock: rational(index + 1, 2) },
          ];
        }),
      );
    const state: EndfieldState = {
      ...defaults,
      resourceLimits: { enabled: true, rates },
      resourceRecipeSettings,
      checkedDerived: new Set(resourceIds),
    };
    expect(decodeEndfield(encodeEndfield(state), data)).toEqual(state);
  });

  it('preserves very small and large fractions without floating point conversion', () => {
    const defaults = createEndfieldState();
    const tiny = new Rational(1n, 10n ** 400n);
    const state: EndfieldState = {
      ...defaults,
      resourceLimits: {
        ...defaults.resourceLimits,
        rates: {
          ...defaults.resourceLimits.rates,
          iron_ore: new Rational(900719925474099312345n, 7n),
          gas_inert: tiny,
        },
      },
      machineLimits: {
        ...defaults.machineLimits,
        limits: { xiranite_oven_1: rational.zero },
      },
      electric: tiny.inverse(),
    };
    const encoded = encodeEndfield(state)!;
    expect(encoded).toContain(tiny.toFraction(false));
    expect(decodeEndfield(encoded, data)).toEqual(state);
  });

  it('rejects malformed fields, invalid constraints and unvalidated machine references', () => {
    expect(() =>
      encodeEndfield({
        ...createEndfieldState(),
        resourceRecipeSettings: { originium_ore: { machineId: '' } },
      }),
    ).toThrowError(/Empty machine ID/);
    for (const encoded of [
      3,
      '',
      'bad',
      '%!',
      '1=2',
      '***1+2',
      '1*2*3*4*5*6',
      '1*2*3*4*5*6*7',
      '1*2*3*4*5*6*7*8',
      '*',
      'zz',
      '*1~2~3~4~5~6~7',
      '*-1',
      '*1/0',
      '*1e2',
      '**-1',
      '**1.5',
      '***1/0',
      '***-1e-8',
      '****~0',
      '****~-1',
      '****~1.5',
      '****!',
      '****!FF',
      '****!41',
      '****~~~~~~~~~~~~~1',
    ])
      expect(() => decodeEndfield(encoded, data))
        .withContext(String(encoded))
        .toThrowError(Error);
    const missing = encodeEndfield({
      ...createEndfieldState(),
      resourceRecipeSettings: { originium_ore: { machineId: 'missing' } },
    });
    expect(() => decodeEndfield(missing, data)).toThrowError(/Unknown machine/);
    const wrongProducer = encodeEndfield({
      ...createEndfieldState(),
      resourceRecipeSettings: { copper_ore: { machineId: 'other-drill' } },
    });
    expect(() => decodeEndfield(wrongProducer, data)).toThrowError(
      /not a producer/,
    );
    expect(() => decodeEndfield(wrongProducer)).toThrowError(
      /Data is required/,
    );
  });

  it('rejects source machines when the source has no producer', () => {
    const producerless: ModData = {
      ...data,
      recipes: [
        { id: 'originium_ore', name: 'Source', time: 1, in: {}, out: {} },
      ],
    };
    const encoded = encodeEndfield({
      ...createEndfieldState(),
      resourceRecipeSettings: { originium_ore: { machineId: escapedMachine } },
    });
    expect(() => decodeEndfield(encoded, producerless)).toThrowError(
      /not a producer/,
    );
  });

  it('keeps a representative extension compact', () => {
    const defaults = createEndfieldState();
    const state: EndfieldState = {
      ...defaults,
      resourceLimits: {
        enabled: true,
        rates: {
          ...defaults.resourceLimits.rates,
          copper_ore: rational(17, 3),
        },
      },
      resourceRecipeSettings: {
        copper_ore: { machineId: escapedMachine, overclock: rational(125) },
      },
      checkedDerived: new Set(['copper_ore']),
      electric: rational(7, 9),
    };
    expect(encodeEndfield(state)!.length).toBeLessThan(100);
  });
});
