import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import manifest from '/public/endfield/product.json';
import { AccordionModule } from '~/components/accordion/accordion-module';
import { Button } from '~/components/button/button';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { TranslatePipe } from '~/translate/translate-pipe';

@Component({
  selector: 'lab-endfield-guide',
  imports: [RouterLink, AccordionModule, Button, TranslatePipe],
  templateUrl: './guide.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class EndfieldGuide {
  protected readonly preferences = inject(PreferencesStore);
  protected readonly manifest = manifest;
  protected readonly examples = [
    {
      name: 'endfield.guide.exampleTundra',
      params: {
        z: 'eJx9kVGPojAUhf8ND002KWVw9KEPK1Fso5hRh5b7RkFimZaSRUfg129w3M1mH-bt5LsnN-ee6-gSEPH90HM0R-EMIxR4jgIicxQgtPIcxYi8PPEV-eQPPiEfz5.8BwonvPEcHVEwyaXnaPglt56jPSJPaq8Ue8YVdOmdK3oeOAHJx1wsbqx2.TbiA8jks5S8hve-VcLgYmCz88CNsmut4vSD1a3NRD.C8a4Lu8Ygd3rfdFoFvAVibrlMr5IsBjiyGat.6m3E-1Ksh3LTVgVZ3yD6y9vCLm7.eWsVLO8geaUCbljt9C5iHbPlpfAXL7nkF2UN.sffZDKpchGaonnTe83urPEX24hfM5G4iZ9ic83lYWR1-8psessE70C86b2Fi9okZhvxLhd-W26-7jjHZshE2JZxWqkAjDLz.pHjxHQlcceawzQfwabDNztHFaRDRt71XnNcivCjsCtdHe8aRG-y4DDkYjfl7Zmeekyf.vQIImmLOD2BPOBchM2j.wB3zCYORPILxGEFkrelffxCSYm9T-qT3wCBvkg_',
        v: '12',
      },
    },
    {
      name: 'endfield.guide.exampleCoupons',
      params: {
        z: 'eJx9kUFvozAQhf8NB0uVDIS0HDg0qCG2EqKSFJu5YQiKqQ3WEhrMr18ljarVHnp7-uZp9OZNH60AIeQ5fVSiYIkR8p0-wshbPOQRufjloZ.QAvkIbZw-Cu9EXyLsqL6KVs6piU6WesDpXLJwJG0.bWNqgadfNactfExGMIUrS5YnS5XQaymS.JO0RhdsmuFwlZVeY-A7ue8GKXxqwFNjyfML90ILB7Ik7avcxnSq2drWG9NU3nqE-IebSofjf95W-KsrcNoInyrS9nIXk4Ho-ly54aLk9Cy0wv.4u4KnTckCVXXvci.JlXRuuI3ppWBpf-PHRF1Kns2kNc9E52PB6ADsXe41nMUmVduYDiVzTb35vuOUKFuwwNRJ3ggflFAv0z3HkciG44F02W0-g87tLztn4ee28D7kXlJcs-Cz0m-yOVwlsEkVfmZLtrvlnYi89Zg..PkBWGqqJD8Cz3DJgu7ev48HotMeWPoHWPYGnJpa338hOMfOV-R6fwEufLKB',
        v: '12',
      },
    },
    {
      name: 'endfield.guide.exampleJinlong',
      params: {
        z: 'eJx9kc2OmzAUhd-GhaW25rfDgsWABmIrIRrIYOMdhqCYsQGVMAGevoKhP-qiK3.6fHR0fd15fgEcHWqdVwDrCQJgap3HgGFtAMFuLsDdiQDrq72RfwO6sdvgBJwN9N2BdLUOsH4V2gDoqzoAHQITGCuHf9gfgfFta.WBvkGAPqu.bIe6e1CTXek9a9fau87YYBQvBXFH1HTTMcAzo.FHRXHD3qaeEwnLGTnXGUuuQsGj7B01vcrJtLD0IUoVQkZP4twOgpu4Z4YcC5rdqeHOLEUOap7FMcBTRcK5OvR1aYQjC377vlTu-E-24ab.YBTX3MQSNZ04BWhAqrqVumsVFN-4kvCvfJvTuC6ILcv2VZwFeqBWd48Bvuck7lZ.ieS9oMmCmv47UtmYEzww8irOit34IZbHAA8F0fvq8PmOayTnnNh9FWU1N5nk8mna5rggUVM4oDZZ7xemsvk.nQs3szk33sRZYFgR-71UL6JOH4KRSeZmMhfktM47IbHuMdvzWcpI3JdRdmE0gQWx223.JhyQijtG4h-MJC-M4r5S219wSqH24enGTxyLyzs_',
        v: '12',
      },
    },
  ];
  protected readonly topics = [
    'locations',
    'views',
    'power',
    'coupons',
    'limits',
    'objectives',
    'archives',
  ];
}
