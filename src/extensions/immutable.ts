import { Rational } from '~/rational/rational';

export type ReadonlyValue<T> = T extends Rational
  ? T
  : T extends (...args: never[]) => unknown
    ? T
    : T extends ReadonlySet<infer V>
      ? ReadonlySet<ReadonlyValue<V>>
      : T extends readonly (infer V)[]
        ? readonly ReadonlyValue<V>[]
        : T extends object
          ? { readonly [K in keyof T]: ReadonlyValue<T[K]> }
          : T;

/** Object.freeze(Set) still permits add/delete; this view exposes only reads. */
class SetSnapshot<T> implements ReadonlySet<T> {
  readonly #values: Set<T>;
  constructor(values: Iterable<T>) {
    this.#values = new Set(values);
    Object.freeze(this);
  }
  get size(): number {
    return this.#values.size;
  }
  has(value: T): boolean {
    return this.#values.has(value);
  }
  entries(): SetIterator<[T, T]> {
    return this.#values.entries();
  }
  keys(): SetIterator<T> {
    return this.#values.keys();
  }
  values(): SetIterator<T> {
    return this.#values.values();
  }
  union<U>(other: ReadonlySetLike<U>): Set<T | U> {
    return this.#values.union(other);
  }
  intersection<U>(other: ReadonlySetLike<U>): Set<T & U> {
    return this.#values.intersection(other);
  }
  difference<U>(other: ReadonlySetLike<U>): Set<T> {
    return this.#values.difference(other);
  }
  symmetricDifference<U>(other: ReadonlySetLike<U>): Set<T | U> {
    return this.#values.symmetricDifference(other);
  }
  isSubsetOf(other: ReadonlySetLike<unknown>): boolean {
    return this.#values.isSubsetOf(other);
  }
  isSupersetOf(other: ReadonlySetLike<unknown>): boolean {
    return this.#values.isSupersetOf(other);
  }
  isDisjointFrom(other: ReadonlySetLike<unknown>): boolean {
    return this.#values.isDisjointFrom(other);
  }
  [Symbol.iterator](): SetIterator<T> {
    return this.#values[Symbol.iterator]();
  }
  forEach(
    callback: (value: T, value2: T, set: ReadonlySet<T>) => void,
    thisArg?: unknown,
  ): void {
    this.#values.forEach((value) => {
      callback.call(thisArg, value, value, this);
    });
  }
}

export function immutableValue<T>(value: T): ReadonlyValue<T> {
  if (value instanceof Rational)
    return Object.freeze(new Rational(value.p, value.q)) as ReadonlyValue<T>;
  if (value == null || typeof value !== 'object')
    return value as ReadonlyValue<T>;
  if (value instanceof Set || value instanceof SetSnapshot)
    return new SetSnapshot(
      Array.from(value, (v: unknown) => immutableValue(v)),
    ) as ReadonlyValue<T>;
  if (Array.isArray(value))
    return Object.freeze(
      value.map((v: unknown) => immutableValue(v)),
    ) as ReadonlyValue<T>;
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, v]: [string, unknown]) => [
        key,
        immutableValue(v),
      ]),
    ),
  ) as ReadonlyValue<T>;
}

/** Copy back at a store boundary, preserving immutable Rational values. */
export function mutableValue<T>(value: ReadonlyValue<T>): T {
  if (value instanceof Rational)
    return Object.freeze(new Rational(value.p, value.q)) as T;
  if (value == null || typeof value !== 'object') return value as T;
  if (value instanceof Set || value instanceof SetSnapshot)
    return new Set(Array.from(value, (v: unknown) => mutableValue(v))) as T;
  if (Array.isArray(value))
    return value.map((v: unknown) => mutableValue(v)) as T;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]: [string, unknown]) => [
      key,
      mutableValue(v),
    ]),
  ) as T;
}
