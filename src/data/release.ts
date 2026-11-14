import { httpResource } from '@angular/common/http';
import { computed, Service } from '@angular/core';

import product from '/public/endfield/product.json';
import { ReleaseInfo } from '~/data/release-info';

@Service()
export class Release {
  readonly config = httpResource<ReleaseInfo>(() => 'release.json');
  readonly version = computed(() => {
    const config = this.config.value();
    if (config == null) return '';
    return `${product.name} ${config.version || '(dev)'}`;
  });
}
