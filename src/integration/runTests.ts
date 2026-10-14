/**
 * Run the integration suite in VS Code, with this extension loaded from dist/. VS Code is
 * downloaded, unless VSCODE_EXECUTABLE_PATH names an installed one, e.g. on macOS
 * "/Applications/Visual Studio Code.app/Contents/MacOS/Code".
 */
import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  const root = path.resolve(__dirname, "../..");
  await runTests({
    vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH || undefined,
    timeout: 120000,
    extensionDevelopmentPath: root,
    extensionTestsPath: path.resolve(__dirname, "suite.js"),
    launchArgs: [
      "--disable-extensions",
      "--disable-workspace-trust",
      "--skip-welcome",
      "--skip-release-notes",
    ],
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
