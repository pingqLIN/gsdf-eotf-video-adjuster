[CmdletBinding()]
param(
  [string]$ChromePath,
  [switch]$UseSystemChrome,
  [int]$DebugPort = 9338,
  [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-LatestPlaywrightChromium {
  if (-not $env:LOCALAPPDATA) {
    return $null
  }

  $browserRoot = Join-Path $env:LOCALAPPDATA 'ms-playwright'
  if (-not (Test-Path -LiteralPath $browserRoot)) {
    return $null
  }

  $candidate = Get-ChildItem -LiteralPath $browserRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^chromium-\d+$' } |
    Sort-Object { [int]($_.Name -replace '^chromium-', '') } -Descending |
    ForEach-Object {
      $path = Join-Path $_.FullName 'chrome-win64\chrome.exe'
      if (Test-Path -LiteralPath $path) {
        $path
      }
    } |
    Select-Object -First 1

  return $candidate
}

function Get-SystemChrome {
  $candidates = @(
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  return $null
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$extensionDir = Join-Path $repoRoot 'extension'
$selectedChromePath = $null
$selectionReason = $null

if ($ChromePath) {
  $selectedChromePath = Resolve-Path -LiteralPath $ChromePath
  $selectionReason = 'explicit ChromePath parameter'
} elseif ($UseSystemChrome) {
  $selectedChromePath = Get-SystemChrome
  $selectionReason = 'system Google Chrome requested'
} else {
  $selectedChromePath = Get-LatestPlaywrightChromium
  $selectionReason = 'latest local Playwright Chromium'

  if (-not $selectedChromePath) {
    $selectedChromePath = Get-SystemChrome
    $selectionReason = 'fallback system Google Chrome'
  }
}

if (-not $selectedChromePath) {
  throw 'No Chrome or Chromium executable was found. Install Playwright browsers or pass -ChromePath.'
}

$selectedChromePath = [string]$selectedChromePath
$env:CHROME_PATH = $selectedChromePath
$env:CHROME_DEBUG_PORT = [string]$DebugPort
$env:GSDF_EXTENSION_DIR = [string]$extensionDir

$looksLikeGoogleChrome = $selectedChromePath -match '\\Google\\Chrome\\Application\\chrome\.exe$'

if (-not $Quiet) {
  [pscustomobject]@{
    ChromePath = $env:CHROME_PATH
    ChromeDebugPort = $env:CHROME_DEBUG_PORT
    ExtensionLoadRoot = $env:GSDF_EXTENSION_DIR
    SelectionReason = $selectionReason
    SmokeCommand = 'npm run smoke:ext'
    Note = if ($looksLikeGoogleChrome) {
      'Managed Google Chrome may reject --load-extension; prefer Playwright Chromium for smoke tests.'
    } else {
      'Ready for unpacked-extension smoke tests.'
    }
  }
}
