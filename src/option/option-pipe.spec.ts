import { TestBed } from '@angular/core/testing';

import { OptionPipe } from './option-pipe';

describe('OptionPipe', () => {
  let pipe: OptionPipe;

  beforeEach(() => {
    TestBed.runInInjectionContext(() => {
      pipe = new OptionPipe();
    });
  });

  it('should create', () => {
    expect(pipe).toBeTruthy();
  });

  it('returns the matching option and leaves missing values undefined', () => {
    const options = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ];
    expect(pipe.transform('b', options)).toBe(options[1]);
    expect(pipe.transform('missing', options)).toBeUndefined();
  });
});
