// Metro config for the hub app (the workspace root). Watches the shared
// package so edits to @familyhub/shared hot-reload, and pins module resolution
// to the root node_modules (npm workspaces symlinks @familyhub/shared there).
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, "packages/shared")];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

module.exports = config;
