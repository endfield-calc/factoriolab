import { TestBed } from '@angular/core/testing';

import { createEndfieldState } from '~/endfield/domain/model';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import {
  EFFECTIVE_DEFAULTS,
  upstreamProduct,
} from '~/extensions/product-profile';
import { STATE_EXTENSION } from '~/extensions/state-extension';
import { rational } from '~/rational/rational';

import { provideEndfieldStateExtension } from './state-extension';

describe('EndfieldStateExtension', () => {
  it('reads the independent live snapshot and commits or resets only that state', () => {
    TestBed.configureTestingModule({
      providers: [
        ...provideEndfieldStateExtension(),
        {
          provide: EFFECTIVE_DEFAULTS,
          useValue: {
            ...upstreamProduct.defaults(),
            extension: createEndfieldState(),
          },
        },
      ],
    });
    const extension = TestBed.inject(STATE_EXTENSION);
    const store = TestBed.inject(EndfieldStore);
    const original = extension.encode(extension.snapshot());
    store.set({ ...store.snapshot(), electric: rational(3) });
    expect(extension.encode(extension.snapshot())).not.toEqual(original);
    extension.commit(createEndfieldState());
    expect(extension.encode(extension.snapshot())).toEqual(original);
    store.set({ ...store.snapshot(), electric: rational(2) });
    extension.reset();
    expect(store.snapshot().electric).toEqual(rational.one);
    expect(extension.strictImports).toBeTrue();
  });
});
