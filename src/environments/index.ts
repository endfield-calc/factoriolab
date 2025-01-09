export interface Environment {
  production: boolean;
  debug: boolean;
  baseHref: string;
  name?: string;
  gtag?: boolean;
}

export * from './environment';
