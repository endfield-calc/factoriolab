import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';

import { RouterSync } from '~/state/router/router-sync';

@Component({
  selector: 'lab-id',
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
})
export class Id {
  constructor() {
    inject(RouterSync).route$.next(inject(ActivatedRoute));
  }
}
