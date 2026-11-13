import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { DEFAULT_MOD } from '~/data/datasets';
import { createEndfieldProduct } from '~/endfield/product/product';
import { PRODUCT_PROFILE, upstreamProduct } from '~/extensions/product-profile';
import { MockComponent } from '~/tests/mocks/component';
import { TestModule } from '~/tests/test-module';

import { editorGuard, idGuard } from './id-guard';

describe('idGuard', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        provideRouter([
          {
            path: ':id',
            canActivate: [idGuard],
            children: [
              {
                path: 'list',
                component: MockComponent,
              },
            ],
          },
        ]),
      ],
    });

    router = TestBed.inject(Router);
  });

  it('should migrate old states', async () => {
    await RouterTestingHarness.create('/list?p=coal*0.5&s=**0&v=10');
    expect(router.url).toEqual('/1.1/list?v=12&o=coal*0.5&odr=0');
  });

  it('should migrate old zip states', async () => {
    await RouterTestingHarness.create(
      '/list?z=eJxFkctuwjAURP8mi1lUcUiALliQp3FKIRIBqZur0idVKQUKhS749t6RAkjx0dj3NXa-iwqh7y1DzKWtK0AtLV0GU-FXC2ZiIsy8FyO-IBJ0NNhF7M3H3uITRtKVonhW5GvFfUC8KcpfRTZVxNzGMbeMJjkraqpCMeI27rLVrcJVjA6JkhixbMLkd8WA0aTDACuSNgf9MRCygSUcMWCrCMbbFF.MpstyrqgOwAo-fCmfABg9sjfAUYYPlBHrdk2xOPp1bO2OxJ44EBzsaMG1CFpw7OV4a0eDlgHLWtvRQcHJp48lfdCmG1OVlxtvNMc.cV6xvUjbV9k6hZIdG1GchRs1InfnUHQWP9d5u4tMP4BUqoleX.IFsAZPbdw8QpZcMrPsKvOrLK6tHvnifJGMf9XSSg-BVAGYI3YM9MVWwFKqP54Z77WHu1ONUEbSRxstSb2tOkDp7Y3.D1ymp-M_&v=10',
    );
    expect(router.url).toEqual(
      '/sxp/list?z=eJxNkkuPqkAQhf9NLzpxwkvBRS94NjQiooIzbm4EUfEtoqKL-u03NZN5bD5O9ak6lVS4M1khL1aK1tsVze2xNdPxyDhU8j4t0soc7KvkrHphMA6sy.xWS9UyC5M03Ex0rd.0xuZu20rLrTp8X3Sqx2WjP2XnFc6aUDKbQSbxtOO928q8Cq5Pw3vGncAS0nC48fRI9dVbMB03YXY6bmZdfvdWqW2ExXk1ns6zdvjiUV5GYrurF5ezHZWBoteDrC5EtjV7Yrep2jwa7JbGzJQWU8e0b5PhetWPxvZzPUmLaGbXdpTnnvcWna.Ns76s44d56qzsw8q01v3rdmWmHx-jveXXy53SxqOznMdK3ApNc63XdRFx2fbODz3OtIVUOvu1P5g193FS-OKsGfvV0j5wOc72bXMfRsVbkfXae7rNs.6ut5kHSy7zYjO-ysFxdUz9ZDbqL7s3rYlGmpVeTvvy.S3wruZ8lC8fRnKeF1E9uob3uB6Evca.H6uV4NGq.z6ZrDtWZvKPQP2I-lE2e3jhZdTV5ro-829yPEzdfDJur80kV5p455z1D.XNkZ-Hcyf6R06MJ1STSMX2pGLOiVSML0nFvAup2FBBrEnFwgepmJuRillYWhaW6NoeTqSoOKlYjKVlYFSfVEwk6EaIEBHj2BSbN6RiAbq2jgZO2D1c9EJDwwAfIRABRnXJXZaqsmV7cE7Al-BdYKjAcA3hA9wMrDVYFrgK2B7wFGwOsQeWAU4fRAI8Ah4Cj8Gdgr2BIAFbB26A3YPwBYEGjg-OACcA0SU140fEidQszEnNkpaeqEQlrAtKZSqTmvlv9ElqFs1R45C4IT6VgtAQ2CLuiBbRQxgIFfFCYJh4IHSMQsPHWV-nVAHpcxk.4G4fm0aoQlQJGjWlEihfTddf7ZuUqoAx7vNb8R8l4m.liR-3-6OaP4tvv9rZUgevMaV4Ga-iF.pl-Nb3UVz7t911.2jvj-Z.IhekZgEeybUwKKb0H8XrJQqln8IfURM.CcUTJC9KqYy.Ql22jB-BnyDMIZqD3wVxA9EFoYDQQDxB3EG0IHogDBAqiBcIGcQDhA6-Cr4G.AChD2IEYYj.iLOA4AmuRQ7MpD2qksOhZjGY4JBDWbMBpOSQl0wjp2XNJFLlJQtJyTSak5L1PqnQlJRM.aRMM1KyL2BNZ.jYpTOSM5nkTCI5o12Eji.UoNZ.aKOlZQ__&v=12',
    );
  });

  it('should migrate old game shortcuts', async () => {
    const rth = await RouterTestingHarness.create('/factorio');
    expect(router.url).toEqual('/2x1');
    await rth.navigateByUrl('/final-factory');
    expect(router.url).toEqual('/ffy');
    await rth.navigateByUrl('/foundry');
    expect(router.url).toEqual('/fdy');
    await rth.navigateByUrl('/outworld-station');
    expect(router.url).toEqual('/ows');
    await rth.navigateByUrl('/satisfactory');
    expect(router.url).toEqual('/sfy');
    await rth.navigateByUrl('/techtonica');
    expect(router.url).toEqual('/tta');
  });
});

describe('product route restrictions', () => {
  let router: Router;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        {
          provide: PRODUCT_PROFILE,
          useValue: createEndfieldProduct(false, 'zh'),
        },
        provideRouter([
          {
            path: 'editor',
            canActivate: [editorGuard],
            component: MockComponent,
          },
          {
            path: ':id',
            canActivate: [idGuard],
            children: [
              { path: '', pathMatch: 'full', component: MockComponent },
              { path: 'list', component: MockComponent },
              { path: 'flow', component: MockComponent },
              { path: 'data', component: MockComponent },
            ],
          },
        ]),
      ],
    });
    router = TestBed.inject(Router);
  });

  it('keeps every query parameter for allowed and legacy shortcut routes', async () => {
    const harness = await RouterTestingHarness.create(
      '/aef/list?v=11&o=a&o=b&cet=x&z=abc',
    );
    expect(router.url).toBe('/aef/list?v=11&o=a&o=b&cet=x&z=abc');
    await harness.navigateByUrl('/flow?v=11&o=a&o=b&cet=x&z=abc');
    expect(router.url).toBe('/aef/flow?v=11&o=a&o=b&cet=x&z=abc');
    await harness.navigateByUrl('/data?v=11&o=a&o=b');
    expect(router.url).toBe('/aef/data?v=11&o=a&o=b');
  });

  it('redirects other games, custom data and editor without their queries', async () => {
    const harness = await RouterTestingHarness.create(
      '/2x1/list?v=11&o=foreign',
    );
    expect(router.url).toBe('/aef');
    await harness.navigateByUrl('/cst/list?v=11&o=foreign');
    expect(router.url).toBe('/aef');
    await harness.navigateByUrl('/editor?v=11&o=foreign');
    expect(router.url).toBe('/aef');
  });
});

describe('upstream editor capability', () => {
  it('allows the editor without a product provider', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'editor',
            canActivate: [editorGuard],
            component: MockComponent,
          },
        ]),
      ],
    });
    const router = TestBed.inject(Router);
    await RouterTestingHarness.create('/editor?x=1');
    expect(router.url).toBe('/editor?x=1');
  });
});

describe('restricted product without a default mod', () => {
  it('routes legacy shortcuts to the upstream default while retaining the query', async () => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        {
          provide: PRODUCT_PROFILE,
          useValue: {
            ...upstreamProduct,
            allowEditor: false,
            allowedModIds: [DEFAULT_MOD],
          },
        },
        provideRouter([
          {
            path: 'editor',
            canActivate: [editorGuard],
            component: MockComponent,
          },
          {
            path: ':id',
            canActivate: [idGuard],
            children: [
              { path: '', pathMatch: 'full', component: MockComponent },
              { path: 'flow', component: MockComponent },
            ],
          },
        ]),
      ],
    });
    const router = TestBed.inject(Router);
    await RouterTestingHarness.create('/flow?v=11&o=coal');
    expect(router.url).toEqual(`/${DEFAULT_MOD}/flow?v=11&o=coal`);
    await router.navigateByUrl('/editor?untrusted=1');
    expect(router.url).toEqual(`/${DEFAULT_MOD}`);
  });
});
