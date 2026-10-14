/**
 * A client of the Smarter cli api (`/api/v1/cli/`), typed by the platform's OpenAPI document
 * (contract/openapi.json, from which src/contract/openapi.d.ts is generated). Every cli operation
 * is a POST, and every response is the journal's envelope: `data` on success, `error` otherwise.
 */
import type { components, operations } from "../contract/openapi";

type Schemas = components["schemas"];

/** The JSON body of an operation's 200 response. */
type Ok<Op extends keyof operations> = operations[Op]["responses"] extends {
  200: { content: { "application/json": infer Body } };
}
  ? Body
  : never;

export type SamKind = Schemas["SAMKind"];
export type CliValidation = Schemas["CliApiValidation"];
export type CliValidationError = Schemas["CliApiValidationError"];
export type CliResource = Schemas["CliApiResource"];
export type CliWhoami = Schemas["CliApiWhoami"];
export type CliGet = Schemas["CliApiGet"];
export type CliApplied = Schemas["CliApiApplied"];
export type CliVersion = Schemas["CliApiVersion"];
export type JournalError = Schemas["SAMJournalApiErrorBody"];

/** An error of a cli api request: the platform's journaled error, or a network failure. */
export class SmarterApiError extends Error {
  constructor(
    message: string,
    /** The HTTP status, or 0 when the platform couldn't be reached. */
    readonly status: number,
    /** The platform's error, when it returned one. */
    readonly error?: JournalError,
  ) {
    super(message);
    this.name = "SmarterApiError";
  }

  /** Whether the request failed for want of a valid api key. */
  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export type SmarterApiOptions = {
  /** The platform's url, e.g. https://ubc.smarter.sh. */
  rootUrl: string;
  /** The api key, without the "Token " prefix. */
  apiKey?: string;
  /** Request timeout, in milliseconds. */
  timeout?: number;
  /** The User-Agent header's value. */
  userAgent?: string;
  /** The fetch implementation, for tests. */
  fetch?: typeof fetch;
};

export class SmarterApi {
  readonly rootUrl: string;
  private readonly apiKey?: string;
  private readonly timeout: number;
  private readonly userAgent?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SmarterApiOptions) {
    this.rootUrl = options.rootUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeout = options.timeout ?? 10000;
    this.userAgent = options.userAgent;
    this.fetchImpl = options.fetch ?? fetch;
  }

  /** The url of a cli command, e.g. cliUrl("describe", "Secret", {name: "x"}). */
  cliUrl(
    command: string,
    kind?: string,
    query?: Record<string, string>,
  ): string {
    const path = kind
      ? `${command}/${encodeURIComponent(kind)}/`
      : `${command}/`;
    const search =
      query && Object.keys(query).length
        ? `?${new URLSearchParams(query)}`
        : "";
    return `${this.rootUrl}/api/v1/cli/${path}${search}`;
  }

  /**
   * POST to a cli url. A string body is a YAML manifest, which the platform reads with PyYAML, as it
   * does the smarter cli's; anything else is sent as JSON.
   */
  private async post<T>(url: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined)
      headers["Content-Type"] =
        typeof body === "string" ? "application/x-yaml" : "application/json";
    if (this.apiKey) headers.Authorization = `Token ${this.apiKey}`;
    if (this.userAgent) headers["User-Agent"] = this.userAgent;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers,
        body:
          body === undefined
            ? undefined
            : typeof body === "string"
              ? body
              : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.name === "TimeoutError"
            ? "timed out"
            : error.message
          : String(error);
      throw new SmarterApiError(
        `Could not reach ${this.rootUrl}: ${reason}`,
        0,
      );
    }
    const payload = (await response.json().catch(() => undefined)) as
      | { error?: JournalError | string; detail?: string }
      | undefined;
    if (!response.ok) {
      const error = payload?.error;
      const message =
        typeof error === "string"
          ? error
          : (error?.description ??
            payload?.detail ??
            `${response.status} ${response.statusText}`);
      throw new SmarterApiError(
        message,
        response.status,
        typeof error === "object" ? error : undefined,
      );
    }
    if (payload === undefined)
      throw new SmarterApiError(`${url} did not return JSON.`, response.status);
    return payload as T;
  }

  /** A kind's JSON Schema. Public. */
  async jsonSchema(kind: string): Promise<Schemas["JsonSchema"]> {
    return (
      await this.post<Ok<"json_schema">>(this.cliUrl("json-schema", kind))
    ).data;
  }

  /** An example manifest of a kind. Public. */
  async exampleManifest(kind: string): Promise<Schemas["SAMManifest"]> {
    return (
      await this.post<Ok<"example_manifest">>(
        this.cliUrl("example-manifest", kind),
      )
    ).data;
  }

  /** Validate a manifest, as YAML text or as JSON, against its kind's Pydantic model, without saving it. */
  async validate(manifest: unknown): Promise<CliValidation> {
    return (await this.post<Ok<"validate">>(this.cliUrl("validate"), manifest))
      .data;
  }

  /** Create or update the resource that a manifest, as YAML text or as JSON, declares. */
  async apply(manifest: unknown): Promise<Ok<"apply">> {
    return this.post<Ok<"apply">>(this.cliUrl("apply"), manifest);
  }

  /** A resource's manifest. */
  async describe(kind: string, name: string): Promise<Schemas["SAMManifest"]> {
    return (
      await this.post<Ok<"describe">>(this.cliUrl("describe", kind, { name }))
    ).data;
  }

  /** The resources of a kind. */
  async get(kind: string): Promise<CliGet> {
    return (await this.post<Ok<"get">>(this.cliUrl("get", kind))).data;
  }

  async deploy(kind: string, name: string): Promise<Ok<"deploy">> {
    return this.post<Ok<"deploy">>(this.cliUrl("deploy", kind, { name }));
  }

  async undeploy(kind: string, name: string): Promise<Ok<"undeploy">> {
    return this.post<Ok<"undeploy">>(this.cliUrl("undeploy", kind, { name }));
  }

  async delete(kind: string, name: string): Promise<Ok<"delete">> {
    return this.post<Ok<"delete">>(this.cliUrl("delete", kind, { name }));
  }

  /** The kinds that the platform manages. */
  async resources(): Promise<CliResource[]> {
    return (await this.post<Ok<"resources">>(this.cliUrl("resources"))).data;
  }

  /** The api key's user and account. */
  async whoami(): Promise<CliWhoami> {
    return (await this.post<Ok<"whoami">>(this.cliUrl("whoami"))).data;
  }

  /** The platform's version. */
  async version(): Promise<CliVersion> {
    return (await this.post<Ok<"version">>(this.cliUrl("version"))).data;
  }
}
