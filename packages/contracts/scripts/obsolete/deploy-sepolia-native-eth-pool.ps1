# Deploy native-ETH ShieldedPool on Sepolia (replaces tWETH pool). Reuses verifiers from pools.sepolia.json.
# Usage (from packages/contracts):
#   $env:ETH_PASSWORD_FILE = "$env:TEMP\foundry-sepolia-deployer.pw"
#   .\scripts\deploy-sepolia-native-eth-pool.ps1

$ErrorActionPreference = "Stop"
$forge = Join-Path $env:USERPROFILE ".foundry\bin\forge.exe"
$cast = Join-Path $env:USERPROFILE ".foundry\bin\cast.exe"
$rpc = if ($env:SEPOLIA_RPC) { $env:SEPOLIA_RPC } else { "https://ethereum-sepolia-rpc.publicnode.com" }
$registryPath = Join-Path $PSScriptRoot "..\..\..\deployments\pools.sepolia.json"
$registry = Get-Content $registryPath -Raw | ConvertFrom-Json

$ops = $registry.shared.opsFeeRecipient
$poseidon = $registry.shared.poseidon
$depositAdapter = $registry.shared.depositVerifier
$transferAdapter = $registry.shared.transferVerifier
$withdrawAdapter = $registry.shared.withdrawVerifier
$withdraw1Adapter = $registry.shared.withdraw1Verifier
$withdrawPartialAdapter = $registry.shared.withdrawPartialVerifier

$gasRebateWei = if ($registry.shared.gasRebateWei) { $registry.shared.gasRebateWei } else { "800000000000000" }
$tokenRebateAmount = "0"
$fundWei = if ($env:GAS_RESERVE_FUND_WEI) { $env:GAS_RESERVE_FUND_WEI } else { "5000000000000000" }
$nativeAsset = "0x0000000000000000000000000000000000000000"

if (-not $env:ETH_PASSWORD_FILE -or -not (Test-Path $env:ETH_PASSWORD_FILE)) {
  throw "Set ETH_PASSWORD_FILE to a file containing the sepolia-deployer keystore password"
}

$commonWallet = @(
  "--rpc-url", $rpc,
  "--account", "sepolia-deployer",
  "--password-file", $env:ETH_PASSWORD_FILE
)
$forgeWallet = $commonWallet + @("--broadcast")

Push-Location (Join-Path $PSScriptRoot "..")
try {
  Write-Host "Building..." -ForegroundColor Yellow
  & $forge build
  if ($LASTEXITCODE -ne 0) { throw "forge build failed" }

  $ctor = @(
    $nativeAsset, $poseidon,
    $depositAdapter, $withdrawAdapter,
    $withdraw1Adapter, $withdrawPartialAdapter,
    "4", "8", "4", "6000", "2500", "1500", $ops,
    $gasRebateWei, $tokenRebateAmount
  )
  Write-Host ">>> forge create ShieldedPool (native ETH)" -ForegroundColor Cyan
  $args = @("create", "src/ShieldedPool.sol:ShieldedPool") + $forgeWallet + @("--constructor-args") + $ctor
  $out = & $forge @args 2>&1 | Out-String
  Write-Host $out
  if ($LASTEXITCODE -ne 0) { throw "forge create failed" }
  if ($out -notmatch "Deployed to:\s*(0x[a-fA-F0-9]{40})") {
    throw "Could not parse Deployed to address"
  }
  $ethPool = $Matches[1]

  Write-Host ">>> fundGasReserve $ethPool value=$fundWei" -ForegroundColor Cyan
  $fundOut = & $cast send @commonWallet $ethPool "fundGasReserve()" --value $fundWei 2>&1 | Out-String
  Write-Host $fundOut
  if ($LASTEXITCODE -ne 0) { throw "fundGasReserve failed" }

  $prevEth = $null
  if ($registry.pools.eth) { $prevEth = $registry.pools.eth.pool }
  elseif ($registry.pools.weth) { $prevEth = $registry.pools.weth.pool }

  $result = [ordered]@{
    ethPool = $ethPool
    previousEthOrWethPool = $prevEth
    nativeAsset = $nativeAsset
    gasRebateWei = $gasRebateWei
    gasReserveFundWei = $fundWei
    daiPool = $registry.pools.dai.pool
    lusdPool = $registry.pools.lusd.pool
  }
  $outPath = Join-Path $PSScriptRoot "..\deployments\sepolia-native-eth-raw.json"
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($outPath, ($result | ConvertTo-Json -Depth 6), $utf8)
  Write-Host "Wrote $outPath" -ForegroundColor Green
  $result | ConvertTo-Json -Depth 6
}
finally {
  Pop-Location
}
