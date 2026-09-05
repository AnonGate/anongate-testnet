# Redeploy Sepolia ShieldedPools with gas rebate (reuse verifiers/assets from pools.sepolia.json).
# Usage (from packages/contracts):
#   $env:ETH_PASSWORD_FILE = "$env:TEMP\foundry-sepolia-deployer.pw"
#   .\scripts\deploy-sepolia-pools-gas-rebate.ps1

$ErrorActionPreference = "Stop"
$forge = Join-Path $env:USERPROFILE ".foundry\bin\forge.exe"
$cast = Join-Path $env:USERPROFILE ".foundry\bin\cast.exe"
$rpc = if ($env:SEPOLIA_RPC) { $env:SEPOLIA_RPC } else { "https://ethereum-sepolia-rpc.publicnode.com" }
$registryPath = Join-Path $PSScriptRoot "..\..\..\deployments\pools.sepolia.json"
$registry = Get-Content $registryPath -Raw | ConvertFrom-Json

$deployer = $registry.deployer
$ops = $registry.shared.opsFeeRecipient
$poseidon = $registry.shared.poseidon
$depositAdapter = $registry.shared.depositVerifier
$transferAdapter = $registry.shared.transferVerifier
$withdrawAdapter = $registry.shared.withdrawVerifier
$withdraw1Adapter = $registry.shared.withdraw1Verifier
$withdrawPartialAdapter = $registry.shared.withdrawPartialVerifier
$weth = $registry.pools.weth.asset
$dai = $registry.pools.dai.asset
$lusd = $registry.pools.lusd.asset

# 0.0008 ether per successful withdraw path
$gasRebateWei = "800000000000000"
$tokenRebateAmount = "0"
# ETH to fund each pool gas reserve after deploy
$fundWei = if ($env:GAS_RESERVE_FUND_WEI) { $env:GAS_RESERVE_FUND_WEI } else { "5000000000000000" } # 0.005 ether

if (-not $env:ETH_PASSWORD_FILE -or -not (Test-Path $env:ETH_PASSWORD_FILE)) {
  throw "Set ETH_PASSWORD_FILE to a file containing the sepolia-deployer keystore password"
}

$commonWallet = @(
  "--rpc-url", $rpc,
  "--account", "sepolia-deployer",
  "--password-file", $env:ETH_PASSWORD_FILE
)
$forgeWallet = $commonWallet + @("--broadcast")

function Deploy-Pool {
  param([string]$asset)
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
  if ($LASTEXITCODE -ne 0) { throw "forge create failed for asset $asset" }
  if ($out -notmatch "Deployed to:\s*(0x[a-fA-F0-9]{40})") {
    throw "Could not parse Deployed to address for asset $asset"
  }
  return $Matches[1]
}

function Fund-Pool {
  param([string]$pool)
  Write-Host ">>> fundGasReserve $pool value=$fundWei" -ForegroundColor Cyan
  $out = & $cast send @commonWallet $pool "fundGasReserve()" --value $fundWei 2>&1 | Out-String
  Write-Host $out
  if ($LASTEXITCODE -ne 0) { throw "fundGasReserve failed for $pool" }
}

Push-Location (Join-Path $PSScriptRoot "..")
try {
  Write-Host "Building..." -ForegroundColor Yellow
  & $forge build
  if ($LASTEXITCODE -ne 0) { throw "forge build failed" }

  $oldWeth = $registry.pools.weth.pool
  $oldDai = $registry.pools.dai.pool
  $oldLusd = $registry.pools.lusd.pool

  $wethPool = Deploy-Pool $weth
  $daiPool = Deploy-Pool $dai
  $lusdPool = Deploy-Pool $lusd

  Fund-Pool $wethPool
  Fund-Pool $daiPool
  Fund-Pool $lusdPool

  $result = [ordered]@{
    deployer = $deployer
    opsFeeRecipient = $ops
    gasRebateWei = $gasRebateWei
    tokenRebateAmount = $tokenRebateAmount
    gasReserveFundWei = $fundWei
    poseidon = $poseidon
    depositVerifier = $depositAdapter
    transferVerifier = $transferAdapter
    withdrawVerifier = $withdrawAdapter
    withdraw1Verifier = $withdraw1Adapter
    withdrawPartialVerifier = $withdrawPartialAdapter
    previousPools = [ordered]@{
      weth = $oldWeth
      dai = $oldDai
      lusd = $oldLusd
    }
    pools = [ordered]@{
      weth = @{ pool = $wethPool; asset = $weth }
      dai = @{ pool = $daiPool; asset = $dai }
      lusd = @{ pool = $lusdPool; asset = $lusd }
    }
  }

  $outPath = Join-Path $PSScriptRoot "..\deployments\sepolia-gas-rebate-raw.json"
  $result | ConvertTo-Json -Depth 6 | Set-Content -Path $outPath -Encoding utf8
  Write-Host "Wrote $outPath" -ForegroundColor Green
  $result | ConvertTo-Json -Depth 6
}
finally {
  Pop-Location
}
