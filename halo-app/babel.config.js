module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    // Bundles drizzle's generated .sql migrations as strings.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
