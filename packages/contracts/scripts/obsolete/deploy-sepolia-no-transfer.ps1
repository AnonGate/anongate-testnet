# Redeploy all Sepolia pools without shielded transfer (native ETH + tDAI + tLUSD).
# Reuses Poseidon + deposit/withdraw verifiers from pools.sepolia.json.
# Usage (from packages/contracts):
#   $env:ETH_PASSWORD_FILE = "$env:TEMP\foundry-sepolia-deployer.pw"
#   .\scripts\deploy-sepolia-no-transfer.ps1

$ErrorActionPreference = "Stop"
$forge = Join-Path $env:USERPROFILE ".foundry\bin\forge.exe"
$cast = Join-Path $env:USERPROFILE ".foundry\bin\cast.exe"
$rpc = if ($env:SEPOLIA_RPC) { $env:SEPOLIA_RPC } else { "https://ethereum-sepolia-rpc.publicnode.com" }
$registryPath = Join-Path $PSScriptRoot "..\..\..\deployments\pools.sepolia.json"
$rawText = (Get-Content $registryPath -Raw).TrimStart([char]0xFEFF)
$registry = $rawText | ConvertFrom-Json

$ops = $registry.shared.opsFeeRecipient
$poseidon = $registry.shared.poseidon
$depositAdapter = $registry.shared.depositVerifier
$withdrawAdapter = $registry.shared.withdrawVerifier
$withdraw1Adapter = $registry.shared.withdraw1Verifier
$withdrawPartialAdapter = $registry.shared.withdrawPartialVerifier
$daiAsset = $registry.pools.dai.asset
$lusdAsset = $registry.pools.lusd.asset
$nativeAsset = "0x0000000000000000000000000000000000000000"

$gasRebateWei = if ($registry.shared.gasRebateWei) { $registry.shared.gasRebateWei } else { "800000000000000" }
$tokenRebateAmount = "0"
$fundWei = if ($env:GAS_RESERVE_FUND_WEI) { $env:GAS_RESERVE_FUND_WEI } else { "5000000000000000" }

if (-not $env:ETH_PASSWORD_FILE -or -not (Test-Path $env:ETH_PASSWORD_FILE)) {
  throw "Set ETH_PASSWORD_FILE to a file containing the sepolia-deployer keystore password"
}

$commonWallet = @(
  "--rpc-url", $rpc,
  "--account", "sepolia-deployer",
  "--password-file", $env:ETH_PASSWORD_FILE
)
$forgeWallet = $commonWallet + @("--broadcast")

function Deploy-Pool([string]$asset) {
  $ctor = @(
    $asset, $poseidon,
    $depositAdapter, $withdrawAdapter,
    $withdraw1Adapter, $withdrawPartialAdapter,
    "4", "8", "4", "6000", "2500", "1500", $ops,
    $gasRebateWei, $tokenRebateAmount
  )
  Write-Host ">>> forge create ShieldedPool asset=$asset" -ForegroundColor Cyan
  $args = @("create", "src/ShieldedPool.sol:ShieldedPool") + $forgeWallet + @("--constructor-args") + $ctor
  $out = & $forge @args 2>&1 | Out-String
  Write-Host $out
  if ($LASTEXITCODE -ne 0) { throw "forge create failed for $asset" }
  if ($out -notmatch "Deployed to:\s*(0x[a-fA-F0-9]{40})") {
    throw "Could not parse Deployed to for $asset"
  }
  return $Matches[1]
}

function Fund-Pool([string]$pool) {
  Write-Host ">>> fundGasReserve $pool value=$fundWei" -ForegroundColor Cyan
  $out = & $cast send @commonWallet $pool "fundGasReserve()" --value $fundWei 2>&1 | Out-String
  Write-Host $out
  if ($LASTEXITCODE -ne 0) { throw "fundGasReserve failed for $pool" }
}

Push-Location (Join-Path $PSScriptRoot "..")
try {
  & $forge build
  if ($LASTEXITCODE -ne 0) { throw "forge build failed" }

  $prev = [ordered]@{
    eth = $(if ($registry.pools.eth) { $registry.pools.eth.pool } else { $registry.pools.weth.pool })
    dai = $registry.pools.dai.pool
    lusd = $registry.pools.lusd.pool
  }

  $ethPool = Deploy-Pool $nativeAsset
  $daiPool = Deploy-Pool $daiAsset
  $lusdPool = Deploy-Pool $lusdAsset
  Fund-Pool $ethPool
  Fund-Pool $daiPool
  Fund-Pool $lusdPool

  $result = [ordered]@{
    status = "no-transfer"
    gasRebateWei = $gasRebateWei
    gasReserveFundWei = $fundWei
    previousPools = $prev
    pools = [ordered]@{
      eth = @{ pool = $ethPool; asset = $nativeAsset; native = $true }
      dai = @{ pool = $daiPool; asset = $daiAsset }
      lusd = @{ pool = $lusdPool; asset = $lusdAsset }
    }
  }
  $outPath = Join-Path $PSScriptRoot "..\deployments\sepolia-no-transfer-raw.json"
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($outPath, ($result | ConvertTo-Json -Depth 6), $utf8)
  Write-Host "Wrote $outPath" -ForegroundColor Green
  $result | ConvertTo-Json -Depth 6
}
finally {
  Pop-Location
}
