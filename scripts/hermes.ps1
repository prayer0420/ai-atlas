param([string]$Question = '')
$ErrorActionPreference = 'Stop'
$atlasRoot = Split-Path $PSScriptRoot -Parent
$atlasRuntime = Get-Content -LiteralPath (Join-Path $atlasRoot '.local/hermes-runtime.json') -Raw | ConvertFrom-Json
$env:HERMES_HOME = $atlasRuntime.home
$env:PYTHONUTF8 = '1'
$atlasVaultLine = Get-Content -LiteralPath (Join-Path $atlasRoot '.local/worker.env') | Where-Object { $_ -like 'ATLAS_VAULT_PATH=*' }
$atlasVault = ($atlasVaultLine -replace '^ATLAS_VAULT_PATH=', '').Trim('"')
Push-Location -LiteralPath $atlasVault
try {
  if ($Question) {
    & $atlasRuntime.python -m hermes_cli.main chat --oneshot --toolsets atlas,aside --max-turns 8 --run-budget 1200 -q $Question
  } else {
    & $atlasRuntime.python -m hermes_cli.main chat --toolsets atlas,aside
  }
} finally { Pop-Location }
