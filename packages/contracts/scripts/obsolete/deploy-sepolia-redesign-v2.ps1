# Experimental Sepolia redesign-v2 deploy via forge create (avoids forge script ctor decode bug).
# Usage (from packages/contracts):
#   $env:ETH_PASSWORD_FILE = "$env:TEMP\foundry-sepolia-deployer.pw"
#   .\scripts\deploy-sepolia-redesign-v2.ps1

$ErrorActionPreference = "Stop"
$forge = Join-Path $env:USERPROFILE ".foundry\bin\forge.exe"
$cast = Join-Path $env:USERPROFILE ".foundry\bin\cast.exe"
$rpc = if ($env:SEPOLIA_RPC) { $env:SEPOLIA_RPC } else { "https://ethereum-sepolia-rpc.publicnode.com" }
$deployer = if ($env:SEPOLIA_DEPLOYER_ADDRESS) { $env:SEPOLIA_DEPLOYER_ADDRESS } else { "0xa1cEFcd8F0f72684c251c3f352E8D13Dd1256d03" }
$ops = if ($env:OPS_FEE_RECIPIENT) { $env:OPS_FEE_RECIPIENT } else { "0x84e57e85EFe449c0D53dc1ee773DDcD251D2fc5E" }
$weth = if ($env:WETH_ASSET) { $env:WETH_ASSET } else { "0xdf3472Cb19fe7017Cef542bBfC313eA4285ef5a1" }
$dai = if ($env:DAI_ASSET) { $env:DAI_ASSET } else { "0x322c94Da70896A075136809eE54c73b06faE2c50" }
$lusd = if ($env:LUSD_ASSET) { $env:LUSD_ASSET } else { "0x1fF7421311e54551401Cb90586913256FF496a87" }

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
    throw "Could not parse Deployed to address for $Path"
  }
  return $Matches[1]
}

function Deploy-Poseidon {
  $fixture = Get-Content (Join-Path $PSScriptRoot "..\test\fixtures\withdraw_dev_fixture.json") -Raw | ConvertFrom-Json
  $bytecode = $fixture.poseidonBytecode
  if (-not $bytecode.StartsWith("0x")) { $bytecode = "0x" + $bytecode }
  $nonceBefore = & $cast nonce $deployer --rpc-url $rpc
  Write-Host ">>> cast send --create poseidon (nonce=$nonceBefore)" -ForegroundColor Cyan
  # Global wallet/RPC flags must come before the --create subcommand.
  $out = & $cast send @commonWallet --json --create $bytecode 2>&1 | Out-String
  Write-Host $out
  if ($LASTEXITCODE -ne 0) { throw "poseidon create failed" }
  if ($out -match '"contractAddress"\s*:\s*"(0x[a-fA-F0-9]{40})"') { return $Matches[1] }
  if ($out -match "contractAddress\s+(0x[a-fA-F0-9]{40})") { return $Matches[1] }
  $predicted = & $cast compute-address $deployer --nonce $nonceBefore
  if ($predicted -match "(0x[a-fA-F0-9]{40})") { return $Matches[1] }
  throw "Could not parse poseidon address from cast output"
}

Push-Location (Join-Path $PSScriptRoot "..")
try {
  Write-Host "Building..." -ForegroundColor Yellow
  & $forge build
  if ($LASTEXITCODE -ne 0) { throw "forge build failed" }

  $poseidon = Deploy-Poseidon
  $depositRaw = Deploy-Contract "src/verifiers/DepositDevVerifier.sol:DepositDevVerifier"
  $depositAdapter = Deploy-Contract "src/verifiers/DepositDevVerifierAdapter.sol:DepositDevVerifierAdapter" @($depositRaw)
  $transferRaw = Deploy-Contract "src/verifiers/TransferDevVerifier.sol:TransferDevVerifier"
  $transferAdapter = Deploy-Contract "src/verifiers/TransferDevVerifierAdapter.sol:TransferDevVerifierAdapter" @($transferRaw)
  $withdrawRaw = Deploy-Contract "src/verifiers/WithdrawDevVerifier.sol:WithdrawDevVerifier"
  $withdrawAdapter = Deploy-Contract "src/verifiers/WithdrawDevVerifierAdapter.sol:WithdrawDevVerifierAdapter" @($withdrawRaw)
  $withdraw1Raw = Deploy-Contract "src/verifiers/Withdraw1inDevVerifier.sol:Withdraw1inDevVerifier"
  $withdraw1Adapter = Deploy-Contract "src/verifiers/Withdraw1inDevVerifierAdapter.sol:Withdraw1inDevVerifierAdapter" @($withdraw1Raw)
  $withdrawPartialRaw = Deploy-Contract "src/verifiers/WithdrawPartialDevVerifier.sol:WithdrawPartialDevVerifier"
  $withdrawPartialAdapter = Deploy-Contract "src/verifiers/WithdrawPartialDevVerifierAdapter.sol:WithdrawPartialDevVerifierAdapter" @($withdrawPartialRaw)

  # gasRebateWei = 0.0008 ether; tokenRebateAmount = 0 (ETH-first)
  $gasRebateWei = "800000000000000"
  $tokenRebateAmount = "0"
  $poolCtor = {
    param($asset)
    return @(
      $asset, $poseidon,
      $depositAdapter, $withdrawAdapter,
      $withdraw1Adapter, $withdrawPartialAdapter,
      "4", "8", "4", "6000", "2500", "1500", $ops,
      $gasRebateWei, $tokenRebateAmount
    )
  }

  $wethPool = Deploy-Contract "src/ShieldedPool.sol:ShieldedPool" (& $poolCtor $weth)
  $daiPool = Deploy-Contract "src/ShieldedPool.sol:ShieldedPool" (& $poolCtor $dai)
  $lusdPool = Deploy-Contract "src/ShieldedPool.sol:ShieldedPool" (& $poolCtor $lusd)

  $result = [ordered]@{
    deployer = $deployer
    opsFeeRecipient = $ops
    poseidon = $poseidon
    depositRawVerifier = $depositRaw
    depositVerifier = $depositAdapter
    transferRawVerifier = $transferRaw
    transferVerifier = $transferAdapter
    withdrawRawVerifier = $withdrawRaw
    withdrawVerifier = $withdrawAdapter
    withdraw1RawVerifier = $withdraw1Raw
    withdraw1Verifier = $withdraw1Adapter
    withdrawPartialRawVerifier = $withdrawPartialRaw
    withdrawPartialVerifier = $withdrawPartialAdapter
    pools = [ordered]@{
      weth = @{ pool = $wethPool; asset = $weth }
      dai = @{ pool = $daiPool; asset = $dai }
      lusd = @{ pool = $lusdPool; asset = $lusd }
    }
  }

  $outPath = Join-Path $PSScriptRoot "..\deployments\sepolia-redesign-v2-raw.json"
  $result | ConvertTo-Json -Depth 6 | Set-Content -Path $outPath -Encoding utf8
  Write-Host "Wrote $outPath" -ForegroundColor Green
  $result | ConvertTo-Json -Depth 6
}
finally {
  Pop-Location
}
