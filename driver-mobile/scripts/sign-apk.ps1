param(
  [Parameter(Mandatory=$true)][string]$InputPath,
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [string]$SdkPath=$env:ANDROID_HOME
)
$ErrorActionPreference='Stop'
$unsigned=(Resolve-Path -LiteralPath $InputPath).Path
$output=[IO.Path]::GetFullPath($OutputPath)
if ($unsigned -eq $output) { throw 'Keep the unsigned build separate from the signed output.' }
$signingRoot=Join-Path ([Environment]::GetFolderPath('UserProfile')) '.kaafila\signing'
$keystore=Join-Path $signingRoot 'driver-release.jks'
$secure=Import-Clixml -LiteralPath (Join-Path $signingRoot 'release-password.xml')
$env:KAAFILA_SIGN_PASSWORD=[System.Net.NetworkCredential]::new('', $secure).Password
$aligned=Join-Path ([IO.Path]::GetTempPath()) ('kaafila-aligned-'+[Guid]::NewGuid()+'.apk')
try {
  & (Join-Path $SdkPath 'build-tools\36.0.0\zipalign.exe') -f -P 16 4 $unsigned $aligned
  if ($LASTEXITCODE -ne 0) { throw 'APK alignment failed.' }
  New-Item -ItemType Directory -Force -Path (Split-Path $output) | Out-Null
  & (Join-Path $SdkPath 'build-tools\36.0.0\apksigner.bat') sign --ks $keystore --ks-key-alias kaafila --ks-pass env:KAAFILA_SIGN_PASSWORD --key-pass env:KAAFILA_SIGN_PASSWORD --v4-signing-enabled false --out $output $aligned
  if ($LASTEXITCODE -ne 0) { throw 'APK signing failed.' }
  & (Join-Path $SdkPath 'build-tools\36.0.0\apksigner.bat') verify --verbose --print-certs $output
  if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
  Get-FileHash -LiteralPath $output -Algorithm SHA256
} finally {
  $env:KAAFILA_SIGN_PASSWORD=$null
  if (Test-Path -LiteralPath $aligned) { Remove-Item -LiteralPath $aligned }
}
