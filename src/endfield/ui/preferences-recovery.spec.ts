import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, Subject } from 'rxjs';

import english from '/public/endfield/i18n/en.json';
import chinese from '/public/endfield/i18n/zh.json';
import { Preferences } from '~/app/main/preferences/preferences';
import { Select } from '~/components/select/select';
import { provideEndfield } from '~/endfield/providers';
import { initialPreferencesState } from '~/state/preferences/preferences-state';
import { WorkspaceLifecycle } from '~/state/workspace-lifecycle';
import { TestModule } from '~/tests/test-module';
import { setInputs } from '~/tests/utils';

describe('saved states during recovery', () => {
  beforeEach(() => {
    localStorage.removeItem('preferences');
  });
  afterEach(() => {
    localStorage.removeItem('preferences');
  });

  it('uses the normal reset confirmation for valid saved preferences and keeps their archives', async () => {
    localStorage.setItem(
      'preferences',
      JSON.stringify({
        language: 'ja',
        states: { aef: { safe: '/aef/list?v=12&o=iron_ore' } },
      }),
    );
    await TestBed.configureTestingModule({
      imports: [TestModule, Preferences],
      providers: provideEndfield(),
    }).compileComponents();
    const component = TestBed.createComponent(Preferences).componentInstance;
    const store = component['preferencesStore'];
    const defaultTheme = initialPreferencesState.theme;
    expect(store.restoreError()).toBeUndefined();
    store.apply({ theme: defaultTheme === 'light' ? 'dark' : 'light' });
    const open = spyOn(component['confirm'], 'open').and.returnValue(of(1));
    component.reset();
    expect(open).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        header: 'preferences.resetHeader',
        message: 'preferences.resetMessage',
      }),
    );
    expect(store.state().theme).toBe(defaultTheme);
    expect(store.state().states['aef']['safe']).toBe(
      '/aef/list?v=12&o=iron_ore',
    );
    TestBed.tick();
    expect(
      JSON.parse(localStorage.getItem('preferences')!).states.aef.safe,
    ).toBe('/aef/list?v=12&o=iron_ore');
  });

  for (const [label, raw] of [
    ['malformed JSON', '{bad-json'],
    [
      'invalid theme and unloaded archive',
      JSON.stringify({
        theme: 'black',
        states: { aef: { unloaded: '/aef/list?v=12&o=quartz_sand' } },
      }),
    ],
  ]) {
    it(`protects ${label} on cancel and replaces it on explicit confirmation`, async () => {
      localStorage.setItem('preferences', raw);
      spyOn(console, 'warn');
      await TestBed.configureTestingModule({
        imports: [TestModule, Preferences],
        providers: provideEndfield(),
      }).compileComponents();
      const component = TestBed.createComponent(Preferences).componentInstance;
      const store = component['preferencesStore'];
      const defaultLanguage = store.language();
      expect(store.restoreError()).toBeDefined();
      expect(store.states()).toEqual({});
      store.apply({ language: 'ja' });
      store.saveState('aef', 'in-memory', '/aef/list?v=12&o=iron_ore');
      TestBed.tick();
      expect(localStorage.getItem('preferences')).toBe(raw);
      const open = spyOn(component['confirm'], 'open').and.returnValues(
        of(0),
        of(1),
      );

      component.reset();
      expect(open).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({
          header: 'preferences.resetHeader',
          message: 'endfield.recovery.resetPreferences',
          actions: jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'yes', value: 1 }),
            jasmine.objectContaining({ text: 'no', value: 2 }),
            jasmine.objectContaining({ text: 'cancel', value: 0 }),
          ]),
        }),
      );
      expect(store.restoreError()).toBeDefined();
      store.apply({ language: 'ru' });
      TestBed.tick();
      expect(localStorage.getItem('preferences')).toBe(raw);
      expect(store.states()).toEqual({
        aef: { 'in-memory': '/aef/list?v=12&o=iron_ore' },
      });

      component.reset();
      expect(open).toHaveBeenCalledTimes(2);
      expect(open.calls.mostRecent().args[0].message).toBe(
        'endfield.recovery.resetPreferences',
      );
      TestBed.tick();
      expect(store.restoreError()).toBeUndefined();
      expect(localStorage.getItem('preferences')).not.toBe(raw);
      const saved = JSON.parse(localStorage.getItem('preferences')!);
      expect(saved.language).toBe(defaultLanguage);
      expect(saved.states).toEqual({
        aef: { 'in-memory': '/aef/list?v=12&o=iron_ore' },
      });
      expect(localStorage.getItem('preferences.recovery')).toBeNull();
    });
  }

  it('explains the protected original and reset consequences in English and Chinese', () => {
    for (const text of [
      'defaults are in use',
      'original data is kept',
      'automatic saving is paused',
      'Export it',
    ])
      expect(english.endfield.recovery.preferences).toContain(text);
    for (const text of [
      'Export them',
      'replaces the original',
      'only plans currently available in memory',
      'unloaded archives cannot be kept',
    ])
      expect(english.endfield.recovery.resetPreferences).toContain(text);
    for (const text of [
      '使用默认值',
      '原始数据已保留',
      '自动保存已暂停',
      '先导出原文',
    ])
      expect(chinese.endfield.recovery.preferences).toContain(text);
    for (const text of [
      '先导出原文',
      '替换原文',
      '仅保留当前内存中可用的方案',
      '无法保留未能加载的存档',
    ])
      expect(chinese.endfield.recovery.resetPreferences).toContain(text);
  });

  it('blocks archive writes while preserving loading and language selection', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, Preferences],
    }).compileComponents();
    const fixture = TestBed.createComponent(Preferences);
    const component = fixture.componentInstance;
    const lifecycle = TestBed.inject(WorkspaceLifecycle);
    const store = component['preferencesStore'];
    spyOn(store, 'saveState');
    spyOn(store, 'removeState');
    spyOn(component, 'params').and.returnValue('v=11');
    spyOn(component['settingsStore'], 'modStates').and.returnValue({
      safe: 'v=11',
    });
    spyOn(component['settingsStore'], 'stateOptions').and.returnValue([
      { value: 'safe', label: 'safe' },
    ]);
    spyOn(component['router'], 'navigate').and.returnValue(
      Promise.resolve(true),
    );
    lifecycle.begin('/aef/list?z=bad');
    component.selectedState.set('safe');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const language = host.querySelector(
      'lab-form-field[label="preferences.language"] lab-select',
    );
    expect(language).not.toBeNull();
    expect(language?.getAttribute('aria-disabled')).not.toBe('true');
    const archiveSelect = host.querySelector(
      'lab-select[placeholder="preferences.selectSavedState"]',
    );
    expect(archiveSelect).not.toBeNull();
    expect(archiveSelect?.getAttribute('aria-disabled')).not.toBe('true');
    expect(
      archiveSelect?.nextElementSibling?.hasAttribute('disabled'),
    ).toBeTrue();
    component.createState();
    expect(component.editStatus()).toBeNull();
    component.editState('safe');
    expect(component.editStatus()).toBeNull();
    component.editValue.set('new');
    component.editStatus.set('create');
    component.saveState();
    component.saveChanges();
    component.deleteState('safe');
    expect(store.saveState).not.toHaveBeenCalled();
    expect(store.removeState).not.toHaveBeenCalled();
    await component.setState('safe');
    expect(component['router'].navigate).toHaveBeenCalled();
  });

  it('does not clear archives if recovery begins while the reset confirmation is open', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, Preferences],
    }).compileComponents();
    const fixture = TestBed.createComponent(Preferences);
    const component = fixture.componentInstance;
    const reply = new Subject<number | undefined>();
    spyOn(component['confirm'], 'open').and.returnValue(reply.asObservable());
    const clear = spyOn(window.localStorage, 'clear');
    component.reset();
    TestBed.inject(WorkspaceLifecycle).begin('/aef/list?z=bad');
    reply.next(2);
    expect(clear).not.toHaveBeenCalled();
  });
});

describe('Preferences recovery and saved state selection', () => {
  let component: Preferences;
  let fixture: ComponentFixture<Preferences>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, Preferences],
    }).compileComponents();

    fixture = TestBed.createComponent(Preferences);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  it('does not open a reset confirmation while a workspace is being restored', () => {
    const open = spyOn(component['confirm'], 'open');
    TestBed.inject(WorkspaceLifecycle).begin('/aef/list?z=pending');
    component.reset();
    expect(open).not.toHaveBeenCalled();
  });
  it('ignores a pending reset confirmation if restoration starts before the answer', () => {
    const reply = new Subject<number | undefined>();
    const open = spyOn(component['confirm'], 'open').and.returnValue(
      reply.asObservable(),
    );
    const clear = spyOn(window.localStorage, 'clear');
    const reset = spyOn(component['preferencesStore'], 'resetPreferences');
    const navigate = spyOn(component['router'], 'navigate');
    expect(TestBed.inject(WorkspaceLifecycle).ready()).toBeTrue();
    component.reset();
    expect(open).toHaveBeenCalled();
    expect(reply.observed).toBeTrue();
    TestBed.inject(WorkspaceLifecycle).begin('/aef/list?z=bad');
    reply.next(2);
    reply.next(1);
    expect(clear).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
  it('loads the selected archive again after the workspace becomes dirty', async () => {
    spyOn(component['settingsStore'], 'modStates').and.returnValue({
      state: 'v=12&o=iron_ore*60',
      other: 'v=12&o=quartz_sand*30',
    });
    spyOn(component['settingsStore'], 'stateOptions').and.returnValue([
      { label: 'state', value: 'state' },
      { label: 'other', value: 'other' },
    ]);
    component.selectedState.set('state');
    const navigate = spyOn(component['router'], 'navigate').and.returnValue(
      Promise.resolve(true),
    );
    fixture.detectChanges();
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();
    const select = fixture.debugElement.query(By.directive(Select))
      .componentInstance as Select<string>;
    expect(select.value()).toBe('state');
    expect(select.dirty()).toBeTrue();
    select.select('state');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(navigate).toHaveBeenCalledOnceWith([], {
      queryParams: { v: '12', o: 'iron_ore*60' },
    });
    navigate.calls.reset();
    select.select('other');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(navigate).toHaveBeenCalledOnceWith([], {
      queryParams: { v: '12', o: 'quartz_sand*30' },
    });
  });
});

describe('Select explicit selection events', () => {
  let component: Select;
  let fixture: ComponentFixture<Select>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Select],
    }).compileComponents();

    fixture = TestBed.createComponent(Select);
    setInputs(fixture, {
      options: [
        { label: '1', value: 1 },
        { label: '2', value: 2 },
      ],
    });
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  it('reports a repeated explicit choice while keeping unchanged form values quiet', () => {
    const choices: unknown[] = [];
    const changed = jasmine.createSpy('changed');
    component.optionSelected.subscribe((value) => choices.push(value));
    component.registerOnChange(changed);
    component.writeValue(2);
    expect(choices).toEqual([]);
    component.select(1);
    component.select(1);
    component.keydown(
      { label: '1', value: 1 },
      document.createElement('li'),
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );
    expect(choices).toEqual([1, 1, 1]);
    expect(changed).toHaveBeenCalledOnceWith(1);
  });
  it('should add to, and remove from, a selection set', () => {
    const selected = jasmine.createSpy('selected');
    component.optionSelected.subscribe(selected);
    setInputs(fixture, { value: [] });
    component.select(1);
    expect(component['selection']()).toContain(1);
    component.select(1);
    expect(component['selection']()).not.toContain(1);
    expect(selected).not.toHaveBeenCalled();
  });
});
