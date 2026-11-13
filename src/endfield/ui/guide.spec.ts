import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PreferencesStore } from '~/state/preferences/preferences-store';
import { TestModule } from '~/tests/test-module';

import { EndfieldGuide } from './guide';

describe('EndfieldGuide', () => {
  it('keeps legacy example parameters and only shows QQ in Chinese', async () => {
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
    expect(urls[0].searchParams.get('v')).toBe('11');
    expect(urls[0].searchParams.get('z')).toBe(
      'eJw1yDEKgDAQBMDfXLEg5C5GbLYJCBaWVunEVrlGRHy9iLEbxpkLTDWJc0HqAhDFWWA9IjCIM8Da2gfU.p6hoa.fIL09ivNGfJnFmT5O4rxgdfeDQTZfmeWk6gNmmh4R',
    );
    expect(urls[1].searchParams.getAll('o')).toEqual([
      'tundra_coupon***2',
      'originium_ore*560**3',
      'quartz_sand*240**3',
      'iron_ore*1080**3',
      'power_proc_battery_3*4*3**power_sta_1',
      'power_proc_battery_2**3',
    ]);
    expect(urls[1].searchParams.get('loc')).toBe('B');
    expect(urls[2].searchParams.get('v')).toBe('11');
    expect(urls[2].searchParams.get('z')).toBe(
      'eJxFzLEKAjEQhOG3SfGDupvLHVpsYQ5EC6sTBLvDxkJJoz6.ZI1YzccwTLE8M6iEYjNpLdCFYhdicgitObFpOpOWvSvf0Nja8cjg0NYx1cVE-h32oHW4R4WOWL37O7-IK3.NqGM8fK8XHo-nSbiXq23D21Q.U1UrIA__',
    );
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
});
