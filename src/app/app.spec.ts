import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  SwUpdate,
  UnrecoverableStateEvent,
  VersionEvent,
} from '@angular/service-worker';
import { EMPTY, of, Subject } from 'rxjs';

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
  });
});
