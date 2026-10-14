/** Links to each kind's documentation on docs.smarter.sh. */

export const DOCS_ROOT = "https://docs.smarter.sh/en/latest";

/** The docs.smarter.sh page of each kind that has one, under smarter-resources/. */
const PAGES: Record<string, string> = {
  account: "smarter-account",
  user: "smarter-account",
  smarterauthtoken: "smarter-authtoken",
  budget: "smarter-budget",
  apiconnection: "smarter-connection",
  sqlconnection: "smarter-connection",
  customdomain: "smarter-custom-domain",
  guardrail: "smarter-guardrail",
  llmclient: "smarter-llmclient",
  llmhost: "smarter-llmhost",
  llmhostcompute: "smarter-llmhost",
  mcpclient: "smarter-mcpclient",
  orchestrator: "smarter-orchestrator",
  plugin: "smarter-plugin",
  apiplugin: "smarter-plugin",
  sqlplugin: "smarter-plugin",
  skillplugin: "smarter-plugin",
  websearchplugin: "smarter-plugin",
  imagesearchplugin: "smarter-plugin",
  prompt: "smarter-prompt",
  provider: "smarter-provider",
  proxy: "smarter-proxy",
  secret: "smarter-secret",
  vectorsearch: "smarter-vectorsearch",
  vectorstore: "smarter-vectorstore",
};

/** Return the url of a kind's documentation, or of a search for it. */
export function docsUrl(kind: string): string {
  const page = PAGES[kind.toLowerCase()];
  if (page) return `${DOCS_ROOT}/smarter-resources/${page}.html`;
  return `${DOCS_ROOT}/search.html?q=${encodeURIComponent(kind)}`;
}
