import { Entities } from '../utils';

export interface ModI18n {
  name?: string;
  version?: Record<string, string>;
  categories: Entities;
  items: Entities;
  recipes: Entities;
  locations?: Entities;
}
