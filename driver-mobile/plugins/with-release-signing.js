const { withAppBuildGradle } = require('@expo/config-plugins');
module.exports = config => withAppBuildGradle(config, result => {
  const value = result.modResults.contents;
  const signed = value.includes('KAAFILA_KEYSTORE') ? value : value.replace('signingConfigs {', `signingConfigs {
        release {
            storeFile file(System.getenv("KAAFILA_KEYSTORE") ?: "missing-release-key")
            storePassword System.getenv("KAAFILA_STORE_PASSWORD") ?: ""
            keyAlias System.getenv("KAAFILA_KEY_ALIAS") ?: "kaafila"
            keyPassword System.getenv("KAAFILA_KEY_PASSWORD") ?: ""
        }`);
  result.modResults.contents = signed.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs.debug/, '$1signingConfig signingConfigs.release');
  return result;
});
