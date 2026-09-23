// Lets the app import the website's shared, dependency-free files
// (../src/lib/constants.ts, types.ts, demo.ts, format.ts) as "@shared/…", so
// categories, limits and sample data never drift between web and mobile.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../src/lib")];
module.exports = config;
