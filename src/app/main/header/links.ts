import { IconDefinition } from '@fortawesome/angular-fontawesome';
import { faGithub } from '@fortawesome/free-brands-svg-icons';

import product from '/public/endfield/product.json';

interface Link {
  text: string;
  icon: IconDefinition;
  href: string;
}

export const headerLinks: Link[] = [
  {
    text: 'header.source',
    icon: faGithub,
    href: product.sourceUrl,
  },
];
