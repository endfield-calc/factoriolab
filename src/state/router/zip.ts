import { inject, Service } from '@angular/core';

import {
  STATE_EXTENSION,
  WorkspaceRestoreError,
} from '~/extensions/state-extension';
import { Rational, rational } from '~/rational/rational';
import { notNullish } from '~/utils/nullish';

import { Compression } from './compression';
import { ZARRAYSEP, ZEMPTY, ZFALSE, ZFIELDSEP, ZTRUE } from './constants';
import { LabParams } from './lab-params';
import { ZipData } from './zip-data';

type KeysMatching<T, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T];

@Service()
export class Zip {
  private readonly compression = inject(Compression);
  private readonly extension = inject(STATE_EXTENSION);

  private invalid(token: string): never {
    throw new WorkspaceRestoreError([
      {
        code: 'invalid-index',
        message: `Invalid workspace index: ${token}`,
        field: token,
        severity: 'error',
      },
    ]);
  }

  private encodeIndex(value: string, hash: (string | null)[]): string {
    const index = hash.indexOf(value);
    if (index < 0) return this.invalid(value);
    return this.compression.nToId(index);
  }

  private parseIndex(token: string, hash: (string | null)[]): number {
    if (!/^[A-Za-z0-9.-]+$/.test(token) || token.length > 9)
      return this.invalid(token);
    const index = this.compression.idToN(token);
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= hash.length ||
      hash[index] == null
    )
      return this.invalid(token);
    return index;
  }

  zipFields(fields: string[]): string {
    return fields.join(ZFIELDSEP).replace(/\**$/, '');
  }

  zipString(value: string | undefined): string {
    if (value === '') return ZEMPTY;
    return value ?? '';
  }

  zipRational(value: Rational | undefined): string {
    return value == null ? '' : value.toString();
  }

  zipNumber(value: number | Rational | undefined): string {
    return value == null ? '' : value.toString();
  }

  zipArray(value: string[] | number[] | undefined): string {
    return value == null ? '' : value.length ? value.join(ZARRAYSEP) : ZEMPTY;
  }

  zipNString(value: string | undefined, hash: (string | null)[]): string {
    if (value == null) return '';
    if (value === '') return ZEMPTY;
    return this.encodeIndex(value, hash);
  }

  zipBool(value: boolean | undefined): string {
    if (value == null) return '';
    return value ? ZTRUE : ZFALSE;
  }

  zipDiffSubset(
    value: Set<string> | undefined,
    init: Set<string> | undefined,
    all: string[],
    hash: (string | null)[] = all,
  ): string {
    if (
      value == null ||
      (init != null && Array.from(value).every((v) => init.has(v)))
    )
      return '';

    if (value.size === 0) return ZEMPTY;

    for (const id of value) if (!hash.includes(id)) this.invalid(id);

    const allSet = new Set(all);
    const result: string[] = [];
    let start: string | undefined;
    let end: string | undefined;
    const flush = (): void => {
      if (start == null) return;
      if (end == null) result.push(start);
      else result.push(start + ZARRAYSEP + end);
      start = undefined;
      end = undefined;
    };
    hash.forEach((h, i) => {
      if (h != null && allSet.has(h) && value.has(h)) {
        const j = this.compression.nToId(i);
        if (start == null) start = j;
        else end = j;
      } else flush();
    });
    flush();

    return result.join(ZFIELDSEP);
  }

  zipDiffString(
    value: string | undefined,
    init: string | undefined,
    hash?: (string | null)[],
  ): string | [string, string] {
    if (value === init || value == null) return '';
    if (value === '') return ZEMPTY;
    if (hash == null) return value;
    return [value, this.encodeIndex(value, hash)];
  }

  zipDiffNumber(value: number | undefined, init: number | undefined): string {
    if (value === init || value == null) return '';
    return value.toString();
  }

  zipDiffRational(
    value: Rational | undefined,
    init: Rational | undefined,
  ): string {
    if (value == null || (init != null && value.eq(init))) return '';
    return value.toString();
  }

  zipDiffBool(value: boolean, init: boolean): string {
    return value === init ? '' : value ? ZTRUE : ZFALSE;
  }

  zipDiffIndices(
    value: number[] | undefined,
    init: number[] | undefined,
  ): string | [string, string] {
    const zVal =
      value != null ? (value.length > 0 ? value.join(ZARRAYSEP) : ZEMPTY) : '';
    const zInit =
      init != null ? (init.length > 0 ? init.join(ZARRAYSEP) : ZEMPTY) : '';
    return zVal === zInit ? '' : zVal;
  }

  zipDiffArray(
    value: string[] | undefined,
    init: string[] | undefined,
    hash: (string | null)[],
  ): string | [string, string] {
    const zVal =
      value != null ? (value.length > 0 ? value.join(ZARRAYSEP) : ZEMPTY) : '';
    const zInit =
      init != null ? (init.length > 0 ? init.join(ZARRAYSEP) : ZEMPTY) : '';
    if (zVal === zInit) return '';
    if (value == null || value.length === 0) return zVal;
    return [zVal, value.map((v) => this.encodeIndex(v, hash)).join(ZARRAYSEP)];
  }

  parseString(
    value: string | undefined,
    hash?: (string | null)[],
  ): string | undefined {
    if (value === ZEMPTY) return '';
    if (hash != null) return this.parseNString(value, hash);
    if (!value?.length) return undefined;
    return value;
  }

  parseBool(value: string | undefined): boolean | undefined {
    if (!value?.length) return undefined;
    if (this.extension.strictImports && value !== ZTRUE && value !== ZFALSE)
      this.invalid(value);
    return value === ZTRUE;
  }

  parseNumber(value: string | undefined): number | undefined {
    if (!value?.length) return undefined;
    const parsed = Number(value);
    if (this.extension.strictImports && !Number.isFinite(parsed))
      this.invalid(value);
    return parsed;
  }

  parseRational(value: string | undefined): Rational | undefined {
    if (!value?.length) return undefined;
    return rational(value);
  }

  parseArray(
    value: string | undefined,
    hash?: (string | null)[],
  ): string[] | undefined {
    if (hash) return this.parseNArray(value, hash);
    if (!value?.length) return undefined;
    return value === ZEMPTY ? [] : value.split(ZARRAYSEP);
  }

  parseIndices<T extends object>(
    value: string | undefined,
    arr: T[],
  ): T[] | undefined {
    if (!value?.length) return undefined;
    if (value === ZEMPTY) return [];
    return value.split(ZARRAYSEP).map((s) => {
      const index = Number(s);
      if (
        this.extension.strictImports &&
        (!/^\d+$/.test(s) ||
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= arr.length ||
          arr[index] == null)
      )
        this.invalid(s);
      return arr[index] ?? {};
    });
  }

  parseNString(
    value: string | undefined,
    hash: (string | null)[],
  ): string | undefined {
    if (value === ZEMPTY) return '';
    const v = this.parseString(value);
    if (v == null) return v;
    const index = this.extension.strictImports
      ? this.parseIndex(v, hash)
      : this.compression.idToN(v);
    return hash[index] ?? undefined;
  }

  parseNArray(
    value: string | undefined,
    hash: (string | null)[],
  ): string[] | undefined {
    const v = this.parseArray(value);
    if (v == null) return v;
    return v
      .map(
        (a) =>
          hash[
            this.extension.strictImports
              ? this.parseIndex(a, hash)
              : this.compression.idToN(a)
          ],
      )
      .filter(notNullish);
  }

  parseSubset(
    value: string | undefined,
    hash: (string | null)[],
  ): Set<string> | undefined {
    if (!value?.length) return undefined;
    if (value === ZEMPTY) return new Set();

    const ranges = value.split(ZFIELDSEP);
    const result = new Set<string>();
    for (const range of ranges) {
      const tokens = range.split(ZARRAYSEP);
      if (
        this.extension.strictImports &&
        (tokens.length > 2 || tokens.some((t) => !t))
      )
        this.invalid(range);
      const [start, end] = tokens.map((i) =>
        this.extension.strictImports
          ? this.parseIndex(i, hash)
          : this.compression.idToN(i),
      );
      if (this.extension.strictImports && end != null && end < start)
        this.invalid(range);
      const sliceEnd = end != null ? end + 1 : start + 1;
      const slice = hash.slice(start, sliceEnd).filter((v) => v != null);
      slice.forEach((i) => result.add(i));
    }

    return result;
  }

  /**
   * Sets up a curried function stack to generate functions to add settings
   * query parameters to the `ZipData` `LabParams`.
   */
  set<T>(
    zip: ZipData<LabParams>,
    state: T,
    init: T,
  ): <V, A extends unknown[]>(
    value: (v: V, i: V, ...args: A) => string | [string, string],
  ) => (
    name: KeysMatching<LabParams, string | undefined>,
    locator: (state: T) => V,
    ...args: A
  ) => void {
    /**
     * Accepts a function to convert the state value to a string, or a pair of
     * bare / hashed strings, and returns a curried function. Caller is expected
     * to pass in a reference to a `zip` method on this service.
     */
    return (value) => {
      /**
       * Accepts a query parameter name, locator function to get the state
       * value, and any additional arguments to the value function.
       */
      return (name, locator, ...args): void => {
        /**
         * Get current state and initial values, then run value function to get
         * query parameter value.
         */
        const s = locator(state),
          i = locator(init),
          v = value(s, i, ...args);

        /**
         * If value function returned a tuple of bare / hash values, spread
         * them into local variables. Otherwise, set both variables to the
         * result of the value function.
         */
        let b: string | undefined;
        let h: string | undefined;
        if (Array.isArray(v)) [b, h] = [...v];
        else b = h = v;

        /**
         * If the bare value is defined, set the bare and hash values on thir
         * corresponding `LabParams` objects.
         */
        if (!b) return;
        zip.bare[name] = b;
        zip.hash[name] = h;
      };
    };
  }

  /**
   * Sets up a curried function stack to generate functions to get settings
   * state values from `LabParams`.
   */
  get(
    params: LabParams,
  ): <V, A extends unknown[]>(
    value: (s: string | undefined, ...args: A) => V,
  ) => (
    name: KeysMatching<LabParams, string | undefined>,
    ...args: A
  ) => V | undefined {
    /**
     * Accepts a function to convert the query parameter value to its
     * state value, and returns a curried function. Caller is expected
     * to pass in a reference to a `parse` method on this service.
     */
    return (value) => {
      // Bind the method reference to this service before use.
      value = value.bind(this);
      // Run value function to get state value
      return (name, ...args) => {
        try {
          return value(params[name], ...args);
        } catch (error) {
          if (error instanceof WorkspaceRestoreError)
            throw new WorkspaceRestoreError(
              error.diagnostics.map((diagnostic) => ({
                ...diagnostic,
                field: name,
              })),
            );
          throw error;
        }
      };
    };
  }
}
