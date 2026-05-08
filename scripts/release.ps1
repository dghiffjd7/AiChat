param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [string]$Repo = "",
  [string]$KeystorePath = "",
  [string]$KeystoreAlias = "",
  [string]$KeystorePass = "",
  [string]$KeyPass = "",
  [switch]$SkipPreflight,
  [switch]$SkipBuild,
  [switch]$SkipSign,
  [switch]$SkipRelease
)

$ErrorActionPreference = "Stop"

function Get-PlainText([Security.SecureString]$secure) {
  if (-not $secure) { return "" }
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Invoke-ExternalCommand([string]$FailureMessage, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$FailureMessage，退出码 $LASTEXITCODE"
  }
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not $SkipPreflight) {
  Write-Host "[1/4] 发布前检查..."
  Invoke-ExternalCommand "发布前检查失败" { npm run test:all }
  Invoke-ExternalCommand "Rust ZIP contract 检查失败" { npm run test:rust:zip }
}

if (-not $SkipBuild) {
  Write-Host "[2/4] 构建 APK..."
  Invoke-ExternalCommand "构建失败" { npm run android:build }
}

$apkInputCandidates = @(
  (Join-Path $root "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk"),
  (Join-Path $root "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk")
)
$apkInputItem = $apkInputCandidates `
  | Where-Object { Test-Path $_ } `
  | ForEach-Object { Get-Item $_ } `
  | Sort-Object LastWriteTime -Descending `
  | Select-Object -First 1
if ($apkInputItem) {
  $apkInput = $apkInputItem.FullName
}
if (-not $apkInput) {
  $fallback = $apkInputCandidates -join "; "
  throw "未找到 APK：$fallback"
}

$distDir = Join-Path $root "dist"
New-Item -ItemType Directory -Force -Path $distDir | Out-Null

$alignedApk = Join-Path $distDir "app-universal-release-aligned.apk"
$signedApk = Join-Path $distDir "app-universal-release.apk"

if (-not $SkipSign) {
  Write-Host "[3/4] 对齐并签名 APK..."

  if (-not $env:ANDROID_HOME) {
    throw "ANDROID_HOME 未设置。"
  }

  $buildToolsRoot = Join-Path $env:ANDROID_HOME "build-tools"
  $buildTools = Get-ChildItem $buildToolsRoot -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
  if (-not $buildTools) {
    throw "未找到 build-tools，请安装 Android SDK Build-Tools。"
  }

  $zipalign = Join-Path $buildTools.FullName "zipalign.exe"
  $apksigner = Join-Path $buildTools.FullName "apksigner.bat"

  if (-not (Test-Path $zipalign)) { throw "未找到 zipalign：$zipalign" }
  if (-not (Test-Path $apksigner)) { throw "未找到 apksigner：$apksigner" }

  if (-not $KeystorePath) {
    $KeystorePath = Read-Host "请输入 keystore 路径"
  }
  if (-not (Test-Path $KeystorePath)) {
    throw "keystore 不存在：$KeystorePath"
  }
  if (-not $KeystoreAlias) {
    $KeystoreAlias = Read-Host "请输入 keystore alias"
  }
  if (-not $KeystorePass) {
    $KeystorePass = Get-PlainText (Read-Host "请输入 keystore 密码" -AsSecureString)
  }
  if (-not $KeyPass) {
    $KeyPass = Get-PlainText (Read-Host "请输入 key 密码(回车沿用 keystore 密码)" -AsSecureString)
    if (-not $KeyPass) { $KeyPass = $KeystorePass }
  }

  Remove-Item -Force -ErrorAction SilentlyContinue $alignedApk, $signedApk, "$signedApk.idsig"
  Invoke-ExternalCommand "zipalign 失败" { & $zipalign -f -v 4 $apkInput $alignedApk }
  Invoke-ExternalCommand "apksigner 失败" { & $apksigner sign --ks $KeystorePath --ks-key-alias $KeystoreAlias --ks-pass "pass:$KeystorePass" --key-pass "pass:$KeyPass" --out $signedApk $alignedApk }
  Invoke-ExternalCommand "apksigner verify 失败" { & $apksigner verify --verbose $signedApk }
} else {
  Copy-Item $apkInput $signedApk -Force
}

if (-not $SkipRelease) {
  Write-Host "[4/4] 发布 GitHub Release..."
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "未找到 gh CLI，请先安装并完成 gh auth login。"
  }

  $tag = "v$Version"
  $notes = "Android APK $Version"
  $repoArg = @()
  if ($Repo) { $repoArg = @("--repo", $Repo) }

  $exists = $false
  try {
    gh release view $tag @repoArg | Out-Null
    $exists = $true
  } catch {}

  if ($exists) {
    gh release upload $tag $signedApk --clobber @repoArg
  } else {
    gh release create $tag $signedApk --title $tag --notes $notes @repoArg
  }
}

Write-Host "完成：$signedApk"
