import { ComponentFixture, TestBed } from '@angular/core/testing';

import manifest from '/public/endfield/product.json';
import { SettingsStore } from '~/state/settings/settings-store';
import { TestModule } from '~/tests/test-module';
import { setInputs } from '~/tests/utils';

import { Header } from './header';

describe('Header', () => {
  let component: Header;
  let fixture: ComponentFixture<Header>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, Header],
    }).compileComponents();

    fixture = TestBed.createComponent(Header);
    setInputs(fixture, {
      preferencesOpen: false,
      settingsOpen: false,
      settingsXlHidden: false,
    });
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('togglePreferences', () => {
    it('should toggle preferences open and closed', () => {
      component.togglePreferences();
      expect(component.preferencesOpen()).toBeTrue();
      component.togglePreferences();
      expect(component.preferencesOpen()).toBeFalse();
    });
  });

  describe('toggleSettings', () => {
    it('should toggle settings open and closed', () => {
      component.toggleSettings();
      expect(component.settingsOpen()).toBeTrue();
      component.toggleSettings();
      expect(component.settingsOpen()).toBeFalse();
    });
  });

  describe('setGame', () => {
    it('should map a game to its default mod id', () => {
      spyOn(component['router'], 'navigate');
      component.setGame('factorio');
      expect(component['router'].navigate).toHaveBeenCalledWith(['spa']);
    });
  });
});

describe('Header with Endfield dataset', () => {
  it('links to the product source and hides unavailable game and editor links', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, Header],
    }).compileComponents();
    TestBed.inject(SettingsStore).apply({ modId: 'aef' });
    const fixture = TestBed.createComponent(Header);
    setInputs(fixture, {
      preferencesOpen: false,
      settingsOpen: false,
      settingsXlHidden: false,
    });
    fixture.detectChanges();
    const html = fixture.nativeElement as HTMLElement;
    expect(
      html.querySelector(`a[href="${manifest.sourceUrl}"]`),
    ).not.toBeNull();
    expect(html.querySelector('a[href*="discord.gg"]')).toBeNull();
    expect(html.querySelector('a[href*="ko-fi.com"]')).toBeNull();
    expect(html.querySelector('a[href="/editor"]')).toBeNull();
    expect(html.querySelector('lab-select')).toBeNull();
  });
});
