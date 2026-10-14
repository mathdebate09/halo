const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
// drizzle-kit migrations are .sql files imported from drizzle/migrations.js.
config.resolver.sourceExts.push('sql');

module.exports = withNativeWind(config, { input: './src/global.css' });
