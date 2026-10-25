param([string]$SdkPath=$env:ANDROID_HOME,[string]$OutputPath=(Join-Path $PSScriptRoot '..\..\..\output\Kaafila-Driver-0.1.0.apk'))
$ErrorActionPreference='Stop'
$mobileRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $SdkPath -or -not (Test-Path -LiteralPath $SdkPath)) { throw 'Set ANDROID_HOME to an installed Android SDK (API 36, build-tools 36.0.0, NDK 27.1.12297006).' }
$env:ANDROID_HOME=(Resolve-Path -LiteralPath $SdkPath).Path
$env:JAVA_HOME=Split-Path (Split-Path (Get-Command java).Source)
$signingRoot=Join-Path ([Environment]::GetFolderPath('UserProfile')) '.kaafila\signing'
New-Item -ItemType Directory -Force -Path $signingRoot | Out-Null
$env:KAAFILA_KEYSTORE=Join-Path $signingRoot 'driver-release.jks'
$passwordPath=Join-Path $signingRoot 'release-password.xml'
if (-not (Test-Path -LiteralPath $env:KAAFILA_KEYSTORE)) {
  if (Test-Path -LiteralPath $passwordPath) { throw 'Signing password exists without its keystore. Restore the keystore instead of replacing identity.' }
  $randomBytes=New-Object byte[] 32
  $generator=[System.Security.Cryptography.RandomNumberGenerator]::Create(); $generator.GetBytes($randomBytes); $generator.Dispose()
  $password=[Convert]::ToBase64String($randomBytes)
  ConvertTo-SecureString $password -AsPlainText -Force | Export-Clixml -LiteralPath $passwordPath
} else {
  $secure=Import-Clixml -LiteralPath $passwordPath
  $password=[System.Net.NetworkCredential]::new('', $secure).Password
}
$env:KAAFILA_STORE_PASSWORD=$password
$env:KAAFILA_KEY_PASSWORD=$password
$env:KAAFILA_KEY_ALIAS='kaafila'
try {
  if (-not (Test-Path -LiteralPath $env:KAAFILA_KEYSTORE)) {
    & (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -genkeypair -keystore $env:KAAFILA_KEYSTORE -alias kaafila -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Kaafila Driver, OU=Mobile, O=Kaafila, C=IN' -storepass:env KAAFILA_STORE_PASSWORD -keypass:env KAAFILA_KEY_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'Signing key generation failed.' }
  }
  Push-Location $mobileRoot
  & npx.cmd expo prebuild --platform android --no-install
  if ($LASTEXITCODE -ne 0) { throw 'Expo prebuild failed.' }
  $wrapper=Join-Path $mobileRoot 'android\gradle\wrapper\gradle-wrapper.properties'
  $wrapperText=(Get-Content -LiteralPath $wrapper -Raw) -replace 'networkTimeout=\d+', 'networkTimeout=120000'
  Set-Content -LiteralPath $wrapper -Value $wrapperText -NoNewline
  Push-Location (Join-Path $mobileRoot 'android')
  & .\gradlew.bat assembleRelease '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a' --no-daemon --console=plain
  if ($LASTEXITCODE -ne 0) { throw 'Android release build failed.' }
  $apk=Join-Path $mobileRoot 'android\app\build\outputs\apk\release\app-release.apk'
  & (Join-Path $env:ANDROID_HOME 'build-tools\36.0.0\apksigner.bat') verify --print-certs $apk
  if ($LASTEXITCODE -ne 0) { throw 'Release signature verification failed.' }
  New-Item -ItemType Directory -Force -Path (Split-Path ([IO.Path]::GetFullPath($OutputPath))) | Out-Null
  Copy-Item -LiteralPath $apk -Destination $OutputPath
  Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256
} finally {
  Set-Location $mobileRoot
  $env:KAAFILA_STORE_PASSWORD=$null
  $env:KAAFILA_KEY_PASSWORD=$null
  $password=$null
}
