/**
 * Read the api key that the smarter cli saved for a platform, from ~/.smarter/config.yaml, so that
 * someone who has run `smarter configure` doesn't have to enter it again.
 *
 * The cli keeps one key per environment (local, alpha, beta, next, prod), and derives each
 * environment's url from its root domain: http://localhost:9357 for local,
 * https://<environment>.<root domain> for alpha, beta and next, and https://<root domain> for prod.
 */
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { parse } from "yaml";

import { isRecord } from "./yamlDoc";

export const CLI_CONFIG_PATH = path.join(
  os.homedir(),
  ".smarter",
  "config.yaml",
);

const PREFIXED_ENVIRONMENTS = ["alpha", "beta", "next"];

/** Return the cli environment of a platform url: local, alpha, beta, next or prod. */
export function cliEnvironment(rootUrl: string): string {
  let url: URL;
  try {
    url = new URL(rootUrl);
  } catch {
    return "prod";
  }
  if (["localhost", "127.0.0.1"].includes(url.hostname)) return "local";
  const first = url.hostname.split(".")[0];
  return PREFIXED_ENVIRONMENTS.includes(first) ? first : "prod";
}

/** Return the api key that the cli config has for a platform url, if any. */
export function cliApiKey(
  config: unknown,
  rootUrl: string,
): string | undefined {
  if (!isRecord(config)) return undefined;
  const environment = config[cliEnvironment(rootUrl)];
  const key = isRecord(environment) ? environment.api_key : undefined;
  return typeof key === "string" && key.trim() ? key.trim() : undefined;
}

/** Read the cli's api key for a platform url from the cli's config file. */
export async function readCliApiKey(
  rootUrl: string,
  file = CLI_CONFIG_PATH,
): Promise<string | undefined> {
  try {
    return cliApiKey(parse(await fs.readFile(file, "utf8")), rootUrl);
  } catch {
    return undefined;
  }
}
