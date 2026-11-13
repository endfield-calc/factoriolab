import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { Preferences } from '~/app/main/preferences/preferences';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { TestModule } from '~/tests/test-module';

describe('saved states during recovery', () => {
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
