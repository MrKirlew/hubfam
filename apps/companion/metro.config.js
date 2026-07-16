// Metro config for the companion app inside the npm workspace. Watches the
// workspace root so @familyhub/shared (a TS-source package) resolves + reloads.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// Keep hierarchical lookup ON so hoisted subpath modules (e.g.
// promise/setimmediate/es6-extensions, pulled in by react-native) resolve.

module.exports = config;
