/**
 * The JSON Schemas and example manifests of the SAM kinds.
 *
 * The extension bundles the platform's committed contract (contract/sam/<Kind>.schema.json and
 * <Kind>.example.json, copied by scripts/sync-contracts.sh). With the "platform" source, a kind's
 * schema is read from the platform's json-schema endpoint instead, so that it matches the version
 * of Smarter that the manifest will be applied to, and the bundled schema is the fallback when the
 * platform can't be reached.
 */
import { promises as fs } from "fs";
import * as path from "path";

import type { SmarterApi } from "./api";
import type { JsonSchema } from "./schema";

export type SchemaSource = "platform" | "bundled";

/** How long a platform schema is used before it is read again. */
const PLATFORM_TTL_MS = 30 * 60 * 1000;
/** How long to wait before trying an unreachable platform again. */
const FAILURE_TTL_MS = 60 * 1000;

type Cached = {
  schema: JsonSchema;
  expires: number;
  origin: "platform" | "bundled";
};

export type SchemaStoreOptions = {
  /** The folder of the bundled SAM files. */
  bundledDir: string;
  source: () => SchemaSource;
  api: () => SmarterApi;
  log?: (message: string) => void;
  now?: () => number;
};

export class SchemaStore {
  private readonly cache = new Map<string, Cached>();
  private readonly failures = new Map<string, number>();
  private readonly pending = new Map<string, Promise<JsonSchema | undefined>>();
  private bundledKinds?: string[];

  constructor(private readonly options: SchemaStoreOptions) {}

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  /** Forget every schema, e.g. when the platform's url changes. */
  clear(): void {
    this.cache.clear();
    this.failures.clear();
    this.pending.clear();
  }

  /** The bundled kinds, in their canonical case, e.g. LLMClient. */
  async kinds(): Promise<string[]> {
    if (!this.bundledKinds) {
      const files = await fs
        .readdir(this.options.bundledDir)
        .catch(() => [] as string[]);
      this.bundledKinds = files
        .filter((file) => file.endsWith(".schema.json"))
        .map((file) => file.slice(0, -".schema.json".length))
        .sort();
    }
    return this.bundledKinds;
  }

  /** Return a kind's canonical name, matching case-insensitively as the platform does, or undefined. */
  async canonicalKind(kind: string): Promise<string | undefined> {
    const lower = kind.toLowerCase();
    return (await this.kinds()).find((k) => k.toLowerCase() === lower);
  }

  /** Where a kind's schema came from, if it is loaded. */
  origin(kind: string): "platform" | "bundled" | undefined {
    return this.cache.get(this.key(kind))?.origin;
  }

  private key(kind: string): string {
    return `${this.options.source()}|${this.options.api().rootUrl}|${kind.toLowerCase()}`;
  }

  /** Return a kind's JSON Schema, or undefined if the kind is unknown. */
  async schema(kind: string): Promise<JsonSchema | undefined> {
    const key = this.key(kind);
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return cached.schema;
    let pending = this.pending.get(key);
    if (!pending) {
      pending = this.load(kind, key).finally(() => this.pending.delete(key));
      this.pending.set(key, pending);
    }
    return pending;
  }

  private async load(
    kind: string,
    key: string,
  ): Promise<JsonSchema | undefined> {
    const canonical = await this.canonicalKind(kind);
    if (
      this.options.source() === "platform" &&
      (this.failures.get(key) ?? 0) <= this.now()
    ) {
      const api = this.options.api();
      try {
        const schema = (await api.jsonSchema(canonical ?? kind)) as JsonSchema;
        if (schema && typeof schema === "object" && schema.properties) {
          this.cache.set(key, {
            schema,
            expires: this.now() + PLATFORM_TTL_MS,
            origin: "platform",
          });
          this.options.log?.(`Read the ${kind} schema from ${api.rootUrl}.`);
          return schema;
        }
      } catch (error) {
        // an unknown kind is a 4xx: the bundled schema, if any, still applies.
        this.failures.set(key, this.now() + FAILURE_TTL_MS);
        this.options.log?.(
          `Could not read the ${kind} schema from ${api.rootUrl}: ${String(error)}`,
        );
      }
    }
    if (!canonical) return undefined;
    const schema = await this.readBundled<JsonSchema>(
      `${canonical}.schema.json`,
    );
    if (!schema) return undefined;
    // when the platform failed, try it again after the failure's ttl.
    const expires =
      this.options.source() === "platform"
        ? this.now() + FAILURE_TTL_MS
        : Infinity;
    this.cache.set(key, { schema, expires, origin: "bundled" });
    return schema;
  }

  /** Return a kind's bundled example manifest, without its status. */
  async example(kind: string): Promise<Record<string, unknown> | undefined> {
    const canonical = await this.canonicalKind(kind);
    if (!canonical) return undefined;
    return this.readBundled<Record<string, unknown>>(
      `${canonical}.example.json`,
    );
  }

  private async readBundled<T>(file: string): Promise<T | undefined> {
    try {
      return JSON.parse(
        await fs.readFile(path.join(this.options.bundledDir, file), "utf8"),
      ) as T;
    } catch {
      return undefined;
    }
  }
}
