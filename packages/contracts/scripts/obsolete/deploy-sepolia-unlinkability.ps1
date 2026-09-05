# Redeploy Sepolia withdraw verifiers + pools after private-leaf-index redesign.
# Reuses Poseidon + deposit verifier from pools.sepolia.json.
# Usage (from packages/contracts):
#   $env:ETH_PASSWORD_FILE = "$env:TEMP\foundry-sepolia-deployer.pw"
#   .\scripts\deploy-sepolia-unlinkability.ps1

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

function Deploy-Contract {
  param(
    [string]$Path,
    [string[]]$CtorArgs = @()
  )
  $args = @("create", $Path) + $forgeWallet
  if ($CtorArgs.Count -gt 0) {
    $args += @("--constructor-args") + $CtorArgs
  }
  Write-Host ">>> forge create $Path" -ForegroundColor Cyan
  $out = & $forge @args 2>&1 | Out-String
  Write-Host $out
  if ($LASTEXITCODE -ne 0) { throw "forge create failed for $Path" }
  if ($out -notmatch "Deployed to:\s*(0x[a-fA-F0-9]{40})") {
    throw "Could not parse Deployed to for $Path"
  }
  return $Matches[1]
}

function Deploy-Pool([string]$asset, [string]$withdrawAdapter, [string]$withdraw1Adapter, [string]$withdrawPartialAdapter) {
  $ctor = @(
    $asset, $poseidon,
    $depositAdapter, $withdrawAdapter,
    $withdraw1Adapter, $withdrawPartialAdapter,
    "4", "8", "4", "6000", "2500", "1500", $ops,
    $gasRebateWei, $tokenRebateAmount
  )
  return Deploy-Contract "src/ShieldedPool.sol:ShieldedPool" $ctor
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

  $withdrawRaw = Deploy-Contract "src/verifiers/WithdrawDevVerifier.sol:WithdrawDevVerifier"
  $withdrawAdapter = Deploy-Contract "src/verifiers/WithdrawDevVerifierAdapter.sol:WithdrawDevVerifierAdapter" @($withdrawRaw)
  $withdraw1Raw = Deploy-Contract "src/verifiers/Withdraw1inDevVerifier.sol:Withdraw1inDevVerifier"
  $withdraw1Adapter = Deploy-Contract "src/verifiers/Withdraw1inDevVerifierAdapter.sol:Withdraw1inDevVerifierAdapter" @($withdraw1Raw)
  $withdrawPartialRaw = Deploy-Contract "src/verifiers/WithdrawPartialDevVerifier.sol:WithdrawPartialDevVerifier"
  $withdrawPartialAdapter = Deploy-Contract "src/verifiers/WithdrawPartialDevVerifierAdapter.sol:WithdrawPartialDevVerifierAdapter" @($withdrawPartialRaw)

  $prev = [ordered]@{
    eth = $(if ($registry.pools.eth) { $registry.pools.eth.pool } else { $registry.pools.weth.pool })
    dai = $registry.pools.dai.pool
    lusd = $registry.pools.lusd.pool
  }

  $ethPool = Deploy-Pool $nativeAsset $withdrawAdapter $withdraw1Adapter $withdrawPartialAdapter
  $daiPool = Deploy-Pool $daiAsset $withdrawAdapter $withdraw1Adapter $withdrawPartialAdapter
  $lusdPool = Deploy-Pool $lusdAsset $withdrawAdapter $withdraw1Adapter $withdrawPartialAdapter
  Fund-Pool $ethPool
  Fund-Pool $daiPool
  Fund-Pool $lusdPool

  $result = [ordered]@{
    status = "deployed-experimental-unlinkability-v1"
    note = "Withdraw leaf indices are private ZK witnesses; publicFeeData is fee-only. Fresh deposits required."
    previousPools = $prev
    shared = [ordered]@{
      opsFeeRecipient = $ops
      poseidon = $poseidon
      depositVerifier = $depositAdapter
      withdrawRawVerifier = $withdrawRaw
      withdrawVerifier = $withdrawAdapter
      withdraw1RawVerifier = $withdraw1Raw
      withdraw1Verifier = $withdraw1Adapter
      withdrawPartialRawVerifier = $withdrawPartialRaw
      withdrawPartialVerifier = $withdrawPartialAdapter
      gasRebateWei = $gasRebateWei
      tokenRebateAmount = $tokenRebateAmount
    }
    pools = [ordered]@{
      eth = @{ pool = $ethPool; asset = $nativeAsset }
      dai = @{ pool = $daiPool; asset = $daiAsset }
      lusd = @{ pool = $lusdPool; asset = $lusdAsset }
    }
  }

  $outPath = Join-Path $PSScriptRoot "sepolia-unlinkability-raw.json"
  ($result | ConvertTo-Json -Depth 6) | Set-Content -Path $outPath -Encoding utf8
  Write-Host "Wrote $outPath" -ForegroundColor Green
  Write-Host "ETH  $ethPool" -ForegroundColor Green
  Write-Host "DAI  $daiPool" -ForegroundColor Green
  Write-Host "LUSD $lusdPool" -ForegroundColor Green
}
finally {
  Pop-Location
}
