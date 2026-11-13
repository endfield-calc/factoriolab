import { TestBed } from '@angular/core/testing';

import { Main } from '~/app/main/main';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { TestModule } from '~/tests/test-module';

describe('workspace recovery interaction', () => {
  it('disables workspace editors until ready but leaves the header and panels usable', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, Main],
    }).compileComponents();
    const fixture = TestBed.createComponent(Main);
    const lifecycle = TestBed.inject(WorkspaceLifecycle);
    const ticket = lifecycle.begin('/aef/list?z=bad');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(
      host.querySelector('aside[labSettings]')?.hasAttribute('inert'),
    ).toBeTrue();
    expect(
      host.querySelector('lab-objectives')?.hasAttribute('inert'),
    ).toBeTrue();
    expect(
      host.querySelector('router-outlet')?.parentElement?.hasAttribute('inert'),
    ).toBeTrue();
    expect(host.querySelector('header')?.hasAttribute('inert')).toBeFalse();
    lifecycle.complete(ticket);
    fixture.detectChanges();
    expect(
      host.querySelector('aside[labSettings]')?.hasAttribute('inert'),
    ).toBeFalse();
    expect(
      host.querySelector('lab-objectives')?.hasAttribute('inert'),
    ).toBeFalse();
    expect(
      host.querySelector('router-outlet')?.parentElement?.hasAttribute('inert'),
    ).toBeFalse();
  });
});
