import { TestBed } from '@angular/core/testing';

import { emptyModData, ModData } from '~/data/schema/mod-data';
import type { RecipeJson } from '~/data/schema/recipe';
import { SettingsStore } from '~/state/settings/settings-store';
import { TestModule } from '~/tests/test-module';

import {
  availableEndfieldData,
  EndfieldData,
  scheduledActivityStage,
} from './game-data';

const name = { en: 'Fair', zh: '集市', ja: '市', ru: 'Ярмарка' };
const regionData: EndfieldData = {
  schemaVersion: 1,
  domains: [
    {
      domainId: 'domain_1',
      locationId: 'tundra',
      domainName: name,
      couponItemId: 'coupon',
      maxLevel: 1,
      mineSummary: [],
      settlements: [
        {
          settlementId: 'a',
          settlementName: name,
          operatorBonusRate: 20,
          levels: [],
          activities: [
            {
              activityId: 'event',
              activityName: name,
              phases: [{ startTime: 13, endTime: 16, rate: 5 }],
            },
          ],
        },
      ],
    },
  ],
  activities: {
    event: {
      name,
      openTime: 10,
      closeTime: 20,
      stageStarts: [10, 13, 16],
      recipeUnlocks: {},
    },
  },
};

describe('Endfield event data', () => {
  it('leaves a dataset without event data intact', () => {
    const data = emptyModData();
    expect(availableEndfieldData(data, {})).toBe(data);
    TestBed.configureTestingModule({ imports: [TestModule] });
    const settings = TestBed.inject(SettingsStore);
    expect(settings.activityModes()).toEqual({});
    expect(settings.activityTimes()).toEqual({});
  });
  it('closes manufacturing and outpost trades together without editing the stored catalog', () => {
    const flags: RecipeJson['flags'] = ['activity', 'activity-event'];
    const base = { name: '', time: 1, in: {}, out: {} };
    const data: ModData = {
      ...emptyModData(),
      endfield: regionData,
      items: ['voucher', 'part', 'tool'].map((id) => ({
        id,
        name: id,
        category: id === 'voucher' ? 'settlement' : 'activity',
        types: ['item'],
      })),
      recipes: [
        { ...base, id: 'always', out: { voucher: 1 } },
        { ...base, id: 'make', in: { part: 1 }, out: { tool: 1 }, flags },
        {
          ...base,
          id: 'trade',
          category: 'settlement',
          in: { tool: 1 },
          out: { voucher: 1 },
          flags,
        },
      ],
    };
    expect(availableEndfieldData(data, { event: 15 })).toBe(data);
    const closed = availableEndfieldData(data, { event: -Infinity });
    expect(closed.recipes.map((r) => r.id)).toEqual(['always']);
    expect(closed.items.map((i) => i.id)).toEqual(['voucher']);
    expect(data.recipes.length).toBe(3);
    for (const invalid of [
      ['activity'],
      ['activity', 'activity-unknown'],
    ] as const) {
      expect(
        availableEndfieldData(
          {
            ...data,
            recipes: [{ ...base, id: 'unknown', flags: [...invalid] }],
          },
          { event: 15 },
        ).recipes,
      ).toEqual([]);
    }
  });

  it('unlocks advanced manufacturing and its outpost trade in the selected stage', () => {
    const flags: RecipeJson['flags'] = ['activity', 'activity-event'];
    const event = {
      ...regionData.activities['event'],
      recipeUnlocks: { advanced: 13, sellAdvanced: 13 },
    };
    const base = { name: '', time: 1, flags };
    const data: ModData = {
      ...emptyModData(),
      endfield: { ...regionData, activities: { event } },
      items: ['basic', 'advanced'].map((id) => ({
        id,
        name: id,
        category: 'activity',
      })),
      recipes: [
        { ...base, id: 'basic', in: {}, out: { basic: 1 } },
        { ...base, id: 'advanced', in: { basic: 1 }, out: { advanced: 1 } },
        {
          ...base,
          id: 'sellAdvanced',
          in: { advanced: 1 },
          out: { voucher: 1 },
        },
      ],
    };
    for (const time of [10, 12]) {
      const available = availableEndfieldData(data, { event: time });
      expect(available.recipes.map((r) => r.id)).toEqual(['basic']);
      expect(available.items.map((i) => i.id)).toEqual(['basic']);
    }
    expect(availableEndfieldData(data, { event: 13 })).toBe(data);
    expect(availableEndfieldData(data, { event: -Infinity }).recipes).toEqual(
      [],
    );
  });

  it('evaluates automatic stages when event data loads and preserves manual overrides', () => {
    const event = regionData.activities['event'];
    expect(scheduledActivityStage(event, 2)).toBe('upcoming');
    expect(scheduledActivityStage(event, 14)).toBe(13);
    expect(scheduledActivityStage(event, 30)).toBe('ended');
    TestBed.configureTestingModule({ imports: [TestModule] });
    const settings = TestBed.inject(SettingsStore);
    spyOn(Date, 'now').and.returnValue(14);
    spyOn(settings, 'endfieldData').and.returnValue(regionData);
    expect(settings.activityTimes()['event']).toBe(13);
    settings.setActivityMode('event', 16);
    expect(settings.activityTimes()['event']).toBe(16);
    settings.setActivityMode('event', 'disabled');
    expect(settings.activityTimes()['event']).toBe(-Infinity);
    settings.setActivityMode('event', 21);
    expect(settings.activityModes()['event']).toBeUndefined();
    settings.setActivityMode('retired', 11);
    expect(settings.activityModes()['retired']).toBeUndefined();
    settings.setActivityMode('event', 'auto');
    expect(settings.activityTimes()['event']).toBe(13);
  });
});
