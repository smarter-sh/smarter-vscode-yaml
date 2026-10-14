/** The extension's log: the "Smarter" output channel, whose level the user sets in VS Code. */
import * as vscode from "vscode";

let channel: vscode.LogOutputChannel | undefined;

function output(): vscode.LogOutputChannel {
  channel ??= vscode.window.createOutputChannel("Smarter", { log: true });
  return channel;
}

export const log = {
  trace: (message: string) => output().trace(message),
  debug: (message: string) => output().debug(message),
  info: (message: string) => output().info(message),
  warn: (message: string) => output().warn(message),
  error: (message: string) => output().error(message),
  show: () => output().show(true),
  dispose: () => {
    channel?.dispose();
    channel = undefined;
  },
};
