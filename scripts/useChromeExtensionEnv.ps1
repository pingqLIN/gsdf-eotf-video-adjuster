[CmdletBinding()]
param(
  [string]$ChromePath,
  [string]$ExtensionRoot,
  [switch]$UseSystemChrome,
  [int]$DebugPort = 9338,
  [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path

function Find-WorkspaceHelper {
  param([string]$StartPath)

  $current = Split-Path -Parent $StartPath
  while (-not [string]::IsNullOrWhiteSpace($current)) {
    $candidate = Join-Path $current '.codex-env\chrome-extension\Use-ChromeExtensionEnv.ps1'
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return $candidate
    }

    $parent = Split-Path -Parent $current
    if ($parent -eq $current) {
      break
    }
    $current = $parent
  }

  return $null
}

$sharedHelperCandidates = @(
  $env:CODEX_CHROME_EXTENSION_ENV_HELPER,
  (Find-WorkspaceHelper -StartPath $repoRoot)
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

foreach ($sharedHelper in $sharedHelperCandidates) {
  if (Test-Path -LiteralPath $sharedHelper -PathType Leaf) {
    $sharedSplat = @{
      RepoRoot = $repoRoot
      DebugPort = $DebugPort
      Quiet = $Quiet
    }
    if (-not [string]::IsNullOrWhiteSpace($ChromePath)) {
      $sharedSplat.ChromePath = $ChromePath
    }
    if (-not [string]::IsNullOrWhiteSpace($ExtensionRoot)) {
      $sharedSplat.ExtensionRoot = $ExtensionRoot
    }
    if ($UseSystemChrome) {
      $sharedSplat.UseSystemChrome = $true
    }

    . $sharedHelper @sharedSplat
    return
  }
}

function Test-ChromeExtensionManifest {
  param([string]$ManifestPath)

  if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    return $false
  }

  try {
    $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    return ($manifest.manifest_version -in @(2, 3))
  } catch {
    return $false
  }
}

function Resolve-ExtensionRoot {
  param([string]$Candidate)

  if (-not [string]::IsNullOrWhiteSpace($Candidate)) {
    $resolvedCandidate = (Resolve-Path -LiteralPath $Candidate).Path
    $manifestPath = if ((Split-Path -Leaf $resolvedCandidate) -eq 'manifest.json') {
      $resolvedCandidate
    } else {
      Join-Path $resolvedCandidate 'manifest.json'
    }

    if (Test-ChromeExtensionManifest -ManifestPath $manifestPath) {
      return (Split-Path -Parent $manifestPath)
    }

    throw "ExtensionRoot does not contain a Chrome extension manifest: $Candidate"
  }

  foreach ($relativeCandidate in @('extension', '.output\chrome-mv3', 'dist', 'build', 'out', 'pkg', 'unpacked', 'public', '.')) {
    $candidateRoot = Join-Path $repoRoot $relativeCandidate
    $manifestPath = Join-Path $candidateRoot 'manifest.json'
    if (Test-ChromeExtensionManifest -ManifestPath $manifestPath) {
      return (Resolve-Path -LiteralPath $candidateRoot).Path
    }
  }

  throw "Could not find a Chrome extension manifest under $repoRoot. Pass -ExtensionRoot explicitly."
}

function Get-LatestPlaywrightChromium {
  if (-not $env:LOCALAPPDATA) {
    return $null
  }

  $browserRoot = Join-Path $env:LOCALAPPDATA 'ms-playwright'
  if (-not (Test-Path -LiteralPath $browserRoot)) {
    return $null
  }

  return Get-ChildItem -LiteralPath $browserRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^chromium-\d+$' } |
    Sort-Object { [int]($_.Name -replace '^chromium-', '') } -Descending |
    ForEach-Object {
      $candidate = Join-Path $_.FullName 'chrome-win64\chrome.exe'
      if (Test-Path -LiteralPath $candidate) {
        $candidate
      }
    } |
    Select-Object -First 1
}

function Get-SystemChrome {
  $candidates = @(
    (if ($env:ProgramFiles) { Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe' }),
    (if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe' }),
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  return $null
}

$resolvedExtensionRoot = Resolve-ExtensionRoot -Candidate $ExtensionRoot
$selectedChromePath = $null
$selectionReason = $null

if (-not [string]::IsNullOrWhiteSpace($ChromePath)) {
  $selectedChromePath = (Resolve-Path -LiteralPath $ChromePath).Path
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

$env:CODEX_CHROME_EXTENSION_CHROME_PATH = [string]$selectedChromePath
$env:CODEX_CHROME_EXTENSION_DEBUG_PORT = [string]$DebugPort
$env:CODEX_CHROME_EXTENSION_ROOT = $resolvedExtensionRoot
$env:CODEX_CHROME_EXTENSION_REPO_ROOT = $repoRoot
$env:CHROME_PATH = $env:CODEX_CHROME_EXTENSION_CHROME_PATH
$env:CHROME_DEBUG_PORT = $env:CODEX_CHROME_EXTENSION_DEBUG_PORT
$env:CHROME_EXTENSION_ROOT = $env:CODEX_CHROME_EXTENSION_ROOT

$looksLikeGoogleChrome = $env:CHROME_PATH -match '\\Google\\Chrome\\Application\\chrome\.exe$'

if (-not $Quiet) {
  [pscustomobject]@{
    ChromePath = $env:CODEX_CHROME_EXTENSION_CHROME_PATH
    ChromeDebugPort = $env:CODEX_CHROME_EXTENSION_DEBUG_PORT
    ExtensionLoadRoot = $env:CODEX_CHROME_EXTENSION_ROOT
    RepoRoot = $env:CODEX_CHROME_EXTENSION_REPO_ROOT
    SelectionReason = $selectionReason
    SmokeCommand = 'npm run smoke:ext'
    Note = if ($looksLikeGoogleChrome) {
      'Managed Google Chrome may reject --load-extension; prefer Playwright Chromium for smoke tests.'
    } else {
      'Ready for unpacked-extension smoke tests.'
    }
  }
}
