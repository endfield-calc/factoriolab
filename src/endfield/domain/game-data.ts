import type { ModData } from '~/data/schema/mod-data';

export type EndfieldName = Record<'en' | 'zh' | 'ja' | 'ru', string>;

/** A timestamp selects a stage by its start, independent of its display order. */
export type ActivityMode = 'auto' | 'disabled' | number;
export type ActivityModes = Readonly<
  Partial<Record<string, Exclude<ActivityMode, 'auto'>>>
>;
export type ActivityTimes = Readonly<Record<string, number>>;

export interface EndfieldActivity {
  name: EndfieldName;
  openTime: number;
  closeTime: number;
  stageStarts: number[];
  /** Recipes unlocked after the first industrial stage, including outpost trades. */
  recipeUnlocks: Record<string, number>;
}

export interface EndfieldSettlement {
  settlementId: string;
  settlementName: EndfieldName;
  operatorBonusRate: number;
  levels: {
    level: number;
    baseMoneySpeed: number;
    moneyMax: number;
    towerDefenseRate: number;
  }[];
  activities: {
    activityId: string;
    activityName: EndfieldName;
    phases: { startTime: number; endTime: number; rate: number }[];
  }[];
}

export interface EndfieldDomain {
  domainId: string;
  locationId: string;
  domainName: EndfieldName;
  couponItemId: string;
  maxLevel: number;
  settlements: EndfieldSettlement[];
  mineSummary: { itemId: string; outputPerMinute: number }[];
}

export interface EndfieldData {
  schemaVersion: 1;
  activities: Record<string, EndfieldActivity>;
  domains: EndfieldDomain[];
}

export function scheduledActivityStage(
  event: EndfieldActivity,
  now: number,
): number | 'upcoming' | 'ended' {
  if (now < event.openTime) return 'upcoming';
  if (now >= event.closeTime) return 'ended';
  return event.stageStarts.reduce(
    (current, start) => (start <= now ? start : current),
    event.openTime,
  );
}

export function settlementActivityBonus(
  activity: EndfieldSettlement['activities'][number],
  times: ActivityTimes,
): number {
  // Settlement effects use the full activity ID; schedule keys omit its prefix.
  const time = times[activity.activityId.replace(/^activity_/, '')];
  return (
    activity.phases.find((p) => p.startTime <= time && time < p.endTime)
      ?.rate ?? 0
  );
}

/** Keep the stored catalog intact so shares and saved objectives survive a closed event. */
export function availableEndfieldData(
  data: ModData,
  times: ActivityTimes,
): ModData {
  const events = data.endfield?.activities ?? {};
  const recipes = data.recipes.filter((recipe) => {
    if (!recipe.flags?.includes('activity')) return true;
    const flag = recipe.flags.find((f) => f.startsWith('activity-'));
    if (!flag) return false;
    const id = flag.slice('activity-'.length);
    const event = events[id];
    return (
      event != null &&
      times[id] >= (event.recipeUnlocks[recipe.id] ?? event.openTime)
    );
  });
  if (recipes.length === data.recipes.length) return data;
  const used = new Set(
    recipes.flatMap((r) => [...Object.keys(r.in), ...Object.keys(r.out)]),
  );
  return {
    ...data,
    recipes,
    items: data.items.filter(
      (i) => i.category !== 'activity' || used.has(i.id),
    ),
  };
}
