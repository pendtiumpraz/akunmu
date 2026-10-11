/**
 * Where AkunMu Desktop and the browser extension are downloaded: the installers from the public repository's latest
 * GitHub release (asset names without a version, so the links never change), the extension zip from the app itself
 * (public/downloads, made by extension/scripts/pack.mjs).
 */
const LATEST = "https://github.com/pendtiumpraz/akunmu/releases/latest/download";

export const DOWNLOADS = {
  windows: `${LATEST}/AkunMu-Setup-x64.exe`,
  linux: `${LATEST}/AkunMu-linux-x64.tar.gz`,
  releases: "https://github.com/pendtiumpraz/akunmu/releases",
  extension: "/downloads/akunmu-extension.zip",
} as const;

export type Downloads = typeof DOWNLOADS;
