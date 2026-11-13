import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  SwUpdate,
  UnrecoverableStateEvent,
  VersionEvent,
} from '@angular/service-worker';
import { EMPTY, of, Subject } from 'rxjs';

import { CustomDataDialog } from '~/components/custom-data-dialog/custom-data-dialog';
import { CUSTOM_MOD } from '~/data/game';
import { environment } from '~/environments/environment';
import { TestModule } from '~/tests/test-module';

import { App } from './app';

describe('App', () => {
  let component: App;
  let fixture: ComponentFixture<App>;
  let logSpy: jasmine.Spy;
  const swUpdate = {
    unrecoverable: new Subject<UnrecoverableStateEvent>(),
    versionUpdates: new Subject<VersionEvent>(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, App],
      providers: [
        provideZonelessChangeDetection(),
        { provide: SwUpdate, useValue: swUpdate },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(App);
    component = fixture.componentInstance;
    logSpy = spyOn<any, any>(component, 'log');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('constructor', () => {
    it('should log the version info', () => {
      expect(logSpy).toHaveBeenCalled();
    });

    it('should handle unrecoverable updates', () => {
      spyOn(component['confirm'], 'open').and.returnValue(EMPTY);
      swUpdate.unrecoverable.next({} as any);
      expect(component['confirm'].open).toHaveBeenCalled();
    });

    it('should handle version updates', () => {
      spyOn(component['windowClient'], 'reload');
      spyOn(component['confirm'], 'open').and.returnValue(of(true));
      swUpdate.versionUpdates.next({ type: 'VERSION_READY' } as any);
      expect(component['confirm'].open).toHaveBeenCalled();
      expect(component['windowClient'].reload).toHaveBeenCalled();
    });

    it('notifies about a detected download without reloading the workspace', () => {
      spyOn(component['windowClient'], 'reload');
      spyOn(component['confirm'], 'open').and.returnValue(of(true));
      swUpdate.versionUpdates.next({ type: 'VERSION_DETECTED' } as any);
      expect(component['confirm'].open).toHaveBeenCalledWith(
        jasmine.objectContaining({ header: 'app.updateDetected' }),
      );
      expect(component['windowClient'].reload).not.toHaveBeenCalled();
    });

    it('keeps a ready update deferred when its refresh is cancelled', () => {
      spyOn(component['windowClient'], 'reload');
      spyOn(component['confirm'], 'open').and.returnValue(of(false));
      swUpdate.versionUpdates.next({ type: 'VERSION_READY' } as any);
      expect(component['windowClient'].reload).not.toHaveBeenCalled();
    });

    it('offers a production refresh after installation fails and requires refresh for unrecoverable state', () => {
      const original = environment.production;
      spyOn(component['windowClient'], 'reload');
      spyOn(component['confirm'], 'open').and.returnValue(of(true));
      try {
        environment.production = false;
        swUpdate.versionUpdates.next({
          type: 'VERSION_INSTALLATION_FAILED',
        } as any);
        expect(component['confirm'].open).not.toHaveBeenCalled();
        environment.production = true;
        swUpdate.versionUpdates.next({
          type: 'VERSION_INSTALLATION_FAILED',
        } as any);
        expect(component['confirm'].open).toHaveBeenCalledWith(
          jasmine.objectContaining({ header: 'app.updateRequired' }),
        );
        expect(component['windowClient'].reload).toHaveBeenCalledTimes(1);
        swUpdate.unrecoverable.next({} as any);
        expect(component['windowClient'].reload).toHaveBeenCalledTimes(2);
      } finally {
        environment.production = original;
      }
    });

    it('should open the custom data dialog if selected', () => {
      spyOn(component['dialog'], 'open');
      component['settingsStore'].apply({ modId: CUSTOM_MOD });
      TestBed.tick();
      expect(component['dialog'].open).toHaveBeenCalledWith(CustomDataDialog);
    });
  });
});
