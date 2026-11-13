import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, Subject } from 'rxjs';

import { Select } from '~/components/select/select';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { TestModule } from '~/tests/test-module';

import { Preferences } from './preferences';

describe('Preferences', () => {
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

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('currentState', () => {
    it('should find a state that matches params', () => {
      spyOn(component, 'params').and.returnValue('params');
      spyOn(component['settingsStore'], 'modStates').and.returnValue({
        state: 'params',
      });
      expect(component.currentState()).toEqual('state');
    });
  });

  describe('selectedState', () => {
    it('should use the last selected state, if none matches', () => {
      component['preferencesStore'].saveState('2.0', 'state', '');
      expect(component.selectedState()).toEqual('state');
      component['preferencesStore'].removeState('2.0', 'state');
      expect(component.selectedState()).toEqual('state');
    });
  });

  describe('reset', () => {
    it('does not open a reset confirmation while a workspace is being restored', () => {
      const open = spyOn(component['confirm'], 'open');
      TestBed.inject(WorkspaceLifecycle).begin('/aef/list?z=pending');
      component.reset();
      expect(open).not.toHaveBeenCalled();
    });
    it('should handle preserve saved states', () => {
      spyOn(component['confirm'], 'open').and.returnValue(of(1));
      spyOn(component['preferencesStore'], 'apply');
      component.reset();
      expect(component['preferencesStore'].apply).toHaveBeenCalled();
    });

    it('should handle full reset', async () => {
      spyOn(component['confirm'], 'open').and.returnValue(of(2));
      spyOn(window.localStorage, 'clear');
      spyOn(component['router'], 'navigate').and.returnValue(
        Promise.resolve(true),
      );
      spyOn(component['windowClient'], 'reload');
      component.reset();
      await TestBed.inject(ApplicationRef).whenStable();
      expect(component['windowClient'].reload).toHaveBeenCalled();
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
  });

  describe('saveState', () => {
    it('should return if there is nothing to save', () => {
      spyOn(component['preferencesStore'], 'saveState');
      component.saveState();
      expect(component['preferencesStore'].saveState).not.toHaveBeenCalled();
    });

    it('should edit a saved state', () => {
      component.editValue.set('value');
      component.editStatus.set('edit');
      spyOn(component, 'params').and.returnValue('params');
      spyOn(component['preferencesStore'], 'saveState');
      spyOn(component, 'selectedState').and.returnValue('state');
      spyOn(component['preferencesStore'], 'removeState');
      component.saveState();
      expect(component['preferencesStore'].saveState).toHaveBeenCalled();
      expect(component['preferencesStore'].removeState).toHaveBeenCalled();
    });
  });

  describe('setState', () => {
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

    it('should return if no matching state is found', async () => {
      spyOn(component['router'], 'navigate');
      await component.setState('state');
      expect(component['router'].navigate).not.toHaveBeenCalled();
    });

    it('should set the state and navigate', async () => {
      spyOn(component['settingsStore'], 'modStates').and.returnValue({
        state: 'query',
      });
      spyOn(component['router'], 'navigate').and.returnValue(
        Promise.resolve(true),
      );
      await component.setState('state');
      expect(component['router'].navigate).toHaveBeenCalled();
    });
  });

  describe('saveChanges', () => {
    it('should save changes to a saved state', () => {
      spyOn(component, 'selectedState').and.returnValue('state');
      spyOn(component, 'params').and.returnValue('params');
      spyOn(component['preferencesStore'], 'saveState');
      component.saveChanges();
      expect(component['preferencesStore'].saveState).toHaveBeenCalledWith(
        '2.0',
        'state',
        'params',
      );
    });

    it('should return if no selected state is found', () => {
      spyOn(component['preferencesStore'], 'saveState');
      component.saveChanges();
      expect(component['preferencesStore'].saveState).not.toHaveBeenCalled();
    });
  });

  describe('createState', () => {
    it('should set up the editor to create a new state', () => {
      spyOn(component.editValue, 'set');
      spyOn(component.editStatus, 'set');
      component.createState();
      expect(component.editValue.set).toHaveBeenCalledWith('');
      expect(component.editStatus.set).toHaveBeenCalledWith('create');
    });
  });

  describe('editState', () => {
    it('should set up the editor to edit a state', () => {
      spyOn(component.editValue, 'set');
      spyOn(component.editStatus, 'set');
      component.editState('state');
      expect(component.editValue.set).toHaveBeenCalledWith('state');
      expect(component.editStatus.set).toHaveBeenCalledWith('edit');
    });
  });

  describe('deleteState', () => {
    it('should remove the state from the PreferencesStore', () => {
      spyOn(component['preferencesStore'], 'removeState');
      spyOn(component.selectedState, 'set');
      component.deleteState('state');
      expect(component['preferencesStore'].removeState).toHaveBeenCalled();
      expect(component.selectedState.set).toHaveBeenCalledWith(undefined);
    });
  });
});
