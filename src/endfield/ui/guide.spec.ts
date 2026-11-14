import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { ModData } from '~/data/schema/mod-data';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import { rational } from '~/rational/rational';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { Migration } from '~/state/router/migration';
import { Params } from '~/state/router/params';
import { RouterSync } from '~/state/router/router-sync';
import { SettingsStore } from '~/state/settings/settings-store';
import { TestModule } from '~/tests/test-module';

import { EndfieldGuide } from './guide';

describe('EndfieldGuide', () => {
  it('uses current example links and only shows QQ in Chinese', async () => {
    const language = signal('en');
    await TestBed.configureTestingModule({
      imports: [TestModule, EndfieldGuide],
      providers: [{ provide: PreferencesStore, useValue: { language } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(EndfieldGuide);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        'lab-accordion-item button',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const urls = [
      ...(fixture.nativeElement.querySelectorAll(
        'a',
      ) as NodeListOf<HTMLAnchorElement>),
    ]
      .filter((link) => link.getAttribute('href')?.includes('/aef/flow'))
      .map((link) => new URL(link.href));
    expect(urls.length).toBe(3);
    for (const url of urls) {
      expect(url.searchParams.get('v')).toBe('12');
      expect(url.searchParams.get('z')).toBeTruthy();
    }
    expect(
      fixture.nativeElement.querySelector('a[href*="qm.qq.com"]'),
    ).toBeNull();
    language.set('zh');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('a[href*="qm.qq.com"]'),
    ).not.toBeNull();
    const host: HTMLElement = fixture.nativeElement;
    host.style.width = '382px';
    fixture.detectChanges();
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
  });

  it('loads all current example links through native migration, router and ef codec', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, EndfieldGuide],
    }).compileComponents();
    const settings = TestBed.inject(SettingsStore);
    settings.apply({ modId: 'aef' });
    settings['modDataResource'].set(rawData as unknown as ModData);
    settings['modHashResource'].set(rawHash);
    const router = TestBed.inject(RouterSync);
    const migration = TestBed.inject(Migration);
    const objectives = TestBed.inject(ObjectivesStore);
    const endfield = TestBed.inject(EndfieldStore);
    const guide = TestBed.createComponent(EndfieldGuide)
      .componentInstance as unknown as { examples: { params: Params }[] };
    for (const [index, example] of guide.examples.entries()) {
      const unpacked = await router.unzipQueryParams({ ...example.params });
      expect(unpacked['ef'])
        .withContext(`example ${index + 1}`)
        .toBeTruthy();
      const migrated = migration.migrate('aef', unpacked);
      router.updateState(
        migrated.modId,
        migrated.params,
        migrated.isBare,
        rawData as unknown as ModData,
        rawHash,
      );
      const restored = Object.values(objectives.state());
      expect(restored.length)
        .withContext(`example ${index + 1}`)
        .toBe([10, 6, 17][index]);
      expect(
        restored.every(
          (objective) => objective.type >= 0 && objective.type <= 3,
        ),
      ).toBeTrue();
      expect(endfield.state().electric).toEqual(rational.one);
      expect(settings.state().costs.unproduceable).toEqual(rational(100000000));
      expect(settings.state().costs.recycling).toEqual(rational.one);
    }
  });
});
