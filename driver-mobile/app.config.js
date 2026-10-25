const fs = require('node:fs');
const configured = fs.existsSync('./google-services.json');
module.exports = {
  expo: {
    name: 'Kaafila Driver', slug: 'kaafila-driver', version: '0.1.0', icon:'./assets/icon.png', orientation: 'portrait', scheme: 'kaafila-driver', userInterfaceStyle: 'light',
    android: { package: 'in.kaafila.driver', versionCode: 1, allowBackup: false, ...(configured ? { googleServicesFile: './google-services.json' } : {}), permissions: ['ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION','ACCESS_BACKGROUND_LOCATION','FOREGROUND_SERVICE','FOREGROUND_SERVICE_LOCATION','POST_NOTIFICATIONS','CAMERA'] },
    plugins: [ ...(configured ? ['@react-native-firebase/app','@react-native-firebase/auth'] : []), ['expo-location',{isAndroidBackgroundLocationEnabled:true,isAndroidForegroundServiceEnabled:true}], ['expo-image-picker',{cameraPermission:'Photograph delivered goods for delivery evidence.',microphonePermission:false}], 'expo-sqlite', './plugins/with-release-signing'],
    extra: { firebaseConfigured: configured, apiUrl: process.env.EXPO_PUBLIC_DISPATCH_API_URL || '' }
  }
};
