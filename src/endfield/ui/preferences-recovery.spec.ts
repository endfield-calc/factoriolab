import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, Subject } from 'rxjs';

import { Preferences } from '~/app/main/preferences/preferences';
import { Select } from '~/components/select/select';
import { provideEndfield } from '~/endfield/providers';
import { EFFECTIVE_DEFAULTS } from '~/extensions/product-profile';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { TestModule } from '~/tests/test-module';
import { setInputs } from '~/tests/utils';

describe('saved states during recovery', () => {
  it('resets ordinary preferences while preserving saved archives', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, Preferences],
      providers: provideEndfield(),
    }).compileComponents();
    const fixture = TestBed.createComponent(Preferences);
    const component = fixture.componentInstance;
    const store = component['preferencesStore'];
    const defaultTheme = TestBed.inject(EFFECTIVE_DEFAULTS).preferences.theme;
    store.saveState('aef', 'safe', 'v=11&o=iron_ore');
    store.apply({ theme: defaultTheme === 'light' ? 'dark' : 'light' });
    spyOn(component['confirm'], 'open').and.returnValue(of(1));
    component.reset();
    expect(store.state().theme).toBe(defaultTheme);
    expect(store.state().states['aef']['safe']).toBe('v=11&o=iron_ore');
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
    const apply = spyOn(component['preferencesStore'], 'apply');
    const navigate = spyOn(component['router'], 'navigate');
    expect(TestBed.inject(WorkspaceLifecycle).ready()).toBeTrue();
    component.reset();
    expect(open).toHaveBeenCalled();
    expect(reply.observed).toBeTrue();
    TestBed.inject(WorkspaceLifecycle).begin('/aef/list?z=bad');
    reply.next(2);
    reply.next(1);
    expect(clear).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
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
