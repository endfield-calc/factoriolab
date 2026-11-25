import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { ModData } from '~/data/schema/mod-data';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import { rational } from '~/rational/rational';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { Migration } from '~/state/router/migration';
import { RouterSync } from '~/state/router/router-sync';
import { SettingsStore } from '~/state/settings/settings-store';
import { TestModule } from '~/tests/test-module';
import { Translate } from '~/translate/translate';

import { EndfieldGuide } from './guide';

describe('EndfieldGuide', () => {
  it('shows upcoming, open and ended periods in the selected language', () => {
    TestBed.configureTestingModule({ imports: [TestModule, EndfieldGuide] });
    const settings = TestBed.inject(SettingsStore);
    spyOn(Date, 'now').and.returnValue(15);
    const event = {
      name: { en: 'Market', zh: '集市', ja: '市場', ru: 'Рынок' },
      openTime: 10,
      closeTime: 20,
      stageStarts: [10],
      recipeUnlocks: {},
    };
    const windows = signal<ReturnType<typeof settings.endfieldData>>({
      schemaVersion: 1,
      domains: [],
      activities: {
        first: event,
        later: { ...event, openTime: 21, closeTime: 31, stageStarts: [21] },
        past: { ...event, openTime: 1, closeTime: 9, stageStarts: [1] },
      },
    });
    spyOn(settings, 'endfieldData').and.callFake(windows);
    const language = signal<'en' | 'zh' | 'ja' | 'ru'>('en');
    spyOn(TestBed.inject(PreferencesStore), 'language').and.callFake(language);
    const guide = TestBed.createComponent(EndfieldGuide).componentInstance;
    expect(guide['activities']().map((a) => [a.id, a.status])).toEqual([
      ['later', 'upcoming'],
      ['first', 'open'],
      ['past', 'ended'],
    ]);
    expect(guide['activities']()[1].name).toBe('Market');
    for (const lang of ['zh', 'ja', 'ru'] as const) {
      language.set(lang);
      expect(guide['activities']()[1].name).toBe(event.name[lang]);
    }
    windows.set(undefined);
    expect(guide['activities']()).toEqual([]);
  });

  it('changes each event calculation mode independently of the actual schedule', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, EndfieldGuide],
    }).compileComponents();
    spyOn(TestBed.inject(PreferencesStore), 'language').and.returnValue('en');
    TestBed.inject(Translate).data.update((data) => ({
      ...data,
      'endfield.activities.schedule': 'Status when data loaded',
      'endfield.activities.period': 'Event period',
      'endfield.activities.upcoming': 'Upcoming',
      'endfield.activities.open': 'Open',
      'endfield.activities.ended': 'Ended',
      'endfield.activities.mode': 'Calculation mode',
      'endfield.activities.auto': 'Automatic (when data loads)',
      'endfield.activities.stage': 'Stage',
      'endfield.activities.disabled': 'Disabled',
    }));

    const day = 24 * 60 * 60 * 1000;
    const start = Date.UTC(2026, 0, 1);
    const later = start + 10 * day;
    const settings = TestBed.inject(SettingsStore);
    spyOn(Date, 'now').and.returnValue(start + day / 2);
    const stages = signal({
      first: [start, start + day],
      second: [later, later + day],
    });
    spyOn(settings, 'endfieldData').and.callFake(
      computed(() => ({
        schemaVersion: 1,
        domains: [],
        activities: {
          first: {
            name: { en: 'Market', zh: '集市', ja: '市場', ru: 'Рынок' },
            openTime: start,
            closeTime: start + 2 * day,
            stageStarts: stages().first,
            recipeUnlocks: {},
          },
          second: {
            name: { en: 'Festival', zh: '节庆', ja: '祭り', ru: 'Фестиваль' },
            openTime: later,
            closeTime: later + 2 * day,
            stageStarts: stages().second,
            recipeUnlocks: {},
          },
        },
      })),
    );
    settings.setActivityMode('second', later + day);

    const fixture = TestBed.createComponent(EndfieldGuide);
    fixture.detectChanges();
    const html: HTMLElement = fixture.nativeElement;
    html
      .querySelectorAll<HTMLButtonElement>('lab-accordion-item > button')[1]
      .click();
    fixture.detectChanges();
    const sections = [...html.querySelectorAll<HTMLElement>('section')];
    const market = sections.find((section) =>
      section.querySelector('h3')?.textContent?.includes('Market'),
    )!;
    const festival = sections.find((section) =>
      section.querySelector('h3')?.textContent?.includes('Festival'),
    )!;
    const marketSelect = market.querySelector('select')!;
    const festivalSelect = festival.querySelector('select')!;
    const text = (element: HTMLElement): string =>
      (element.textContent ?? '').replace(/\s+/g, ' ');
    expect(marketSelect.getAttribute('aria-label')).toBe(
      'Market · Calculation mode',
    );
    expect(festivalSelect.getAttribute('aria-label')).toBe(
      'Festival · Calculation mode',
    );
    expect(marketSelect.labels?.length).toBe(1);
    expect([...marketSelect.options].map((option) => option.value)).toEqual([
      'auto',
      String(start),
      String(start + day),
      'disabled',
    ]);
    expect(marketSelect.options[1].textContent).toContain('Stage');
    expect(marketSelect.options[1].textContent).not.toBe(
      marketSelect.options[2].textContent,
    );
    const format = new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    expect(text(market)).toContain(
      `Event period ${format.format(start)} – ${format.format(start + 2 * day)}`,
    );
    expect(marketSelect.options[2].textContent).toContain(
      format.format(start + day),
    );
    expect(text(market)).toContain('Status when data loaded: Open');
    expect(text(festival)).toContain('Status when data loaded: Upcoming');
    expect(marketSelect.value).toBe('auto');
    expect(festivalSelect.value).toBe(String(later + day));
    settings.setActivityMode('second', 'auto');
    fixture.detectChanges();
    expect(festivalSelect.value).toBe('auto');

    marketSelect.value = String(start);
    marketSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(settings.activityModes()).toEqual({ first: start });
    expect(festivalSelect.value).toBe('auto');

    festivalSelect.value = 'disabled';
    festivalSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(settings.activityModes()).toEqual({
      first: start,
      second: 'disabled',
    });
    expect(marketSelect.value).toBe(String(start));

    marketSelect.value = String(start + day);
    marketSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(settings.activityModes()).toEqual({
      first: start + day,
      second: 'disabled',
    });
    expect(text(market)).toContain('Status when data loaded: Open');
    expect(text(festival)).toContain('Status when data loaded: Upcoming');

    stages.set({
      first: [start, start + day / 2, start + day],
      second: [later, later + day],
    });
    fixture.detectChanges();
    expect(marketSelect.value).toBe(String(start + day));
    expect(marketSelect.selectedOptions[0].textContent).toContain('3');

    stages.set({
      first: [start, start + day / 2],
      second: [later, later + day],
    });
    fixture.detectChanges();
    expect(settings.activityModes()).toEqual({ second: 'disabled' });
    expect(marketSelect.value).toBe('auto');
    expect(festivalSelect.value).toBe('disabled');

    marketSelect.value = String(start + day / 2);
    marketSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(settings.activityModes()).toEqual({
      first: start + day / 2,
      second: 'disabled',
    });
    marketSelect.value = 'auto';
    marketSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(settings.activityModes()).toEqual({ second: 'disabled' });
    expect(marketSelect.value).toBe('auto');
    expect(festivalSelect.value).toBe('disabled');
  });

  it('restores the displayed example links and only shows QQ in Chinese', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, EndfieldGuide],
    }).compileComponents();
    const language = signal<'en' | 'zh'>('en');
    spyOn(TestBed.inject(PreferencesStore), 'language').and.callFake(language);
    const settings = TestBed.inject(SettingsStore);
    settings.apply({ modId: 'aef' });
    settings['modDataResource'].set(rawData as unknown as ModData);
    settings['modHashResource'].set(rawHash);
    const router = TestBed.inject(RouterSync);
    const migration = TestBed.inject(Migration);
    const objectives = TestBed.inject(ObjectivesStore);
    const endfield = TestBed.inject(EndfieldStore);
    const fixture = TestBed.createComponent(EndfieldGuide);
    fixture.detectChanges();
    const html: HTMLElement = fixture.nativeElement;
    html.querySelector<HTMLButtonElement>('lab-accordion-item button')!.click();
    fixture.detectChanges();
    const urls = [
      ...html.querySelectorAll<HTMLAnchorElement>('a[href*="/aef/flow"]'),
    ].map((link) => new URL(link.href));
    expect(urls.length).toBe(3);
    for (const [index, url] of urls.entries()) {
      expect(url.searchParams.get('v')).toBe('12');
      expect(url.searchParams.get('z')).toBeTruthy();
      const unpacked = await router.unzipQueryParams(
        Object.fromEntries(url.searchParams),
      );
      expect(unpacked['ef'])
        .withContext(`example ${index + 1}`)
        .toBeUndefined();
      const migrated = migration.migrate('aef', unpacked);
      router.updateState(
        migrated.modId,
        migrated.params,
        migrated.isBare,
        rawData as unknown as ModData,
        rawHash,
      );
      expect(Object.keys(objectives.state()).length)
        .withContext(`example ${index + 1}`)
        .toBeGreaterThan(0);
      expect(endfield.state().electric).toEqual(rational.one);
      expect(settings.state().costs.unproduceable).toEqual(rational(100000000));
      expect(settings.state().costs.recycling).toEqual(rational.one);
    }
    expect(html.querySelector('a[href*="qm.qq.com"]')).toBeNull();
    language.set('zh');
    fixture.detectChanges();
    expect(html.querySelector('a[href*="qm.qq.com"]')).not.toBeNull();
  });
});
