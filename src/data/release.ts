import { httpResource } from '@angular/common/http';
import { computed, inject, Service } from '@angular/core';

import { ReleaseInfo } from '~/data/release-info';
import { PRODUCT_PROFILE } from '~/extensions/product-profile';

@Service()
export class Release {
  private readonly product = inject(PRODUCT_PROFILE);
  readonly config = httpResource<ReleaseInfo>(() => 'release.json');
  readonly version = computed(() => {
    const config = this.config.value();
    if (config == null) return '';
    return `${this.product.name} ${config.version || '(dev)'}`;
  });
}
