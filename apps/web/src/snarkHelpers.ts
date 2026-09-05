type Snarkjs = {
  groth16: {
    fullProve: (
      input: Record<string, unknown>,
      wasm: string,
      zkey: string
    ) => Promise<{ proof: unknown; publicSignals: string[] }>;
    verify: (
      vkey: unknown,
      publicSignals: string[],
      proof: unknown
    ) => Promise<boolean>;
    exportSolidityCallData: (
      proof: unknown,
      publicSignals: string[]
    ) => Promise<string>;
  };
};

export type SolidityProofParts = {
  proofA: [string, string];
  proofB: [[string, string], [string, string]];
  proofC: [string, string];
};

export async function loadSnarkjs(): Promise<Snarkjs> {
  const mod = await import("snarkjs");
  return (mod as { default?: Snarkjs }).default ?? (mod as unknown as Snarkjs);
}

export async function proveAndExport(params: {
  input: Record<string, unknown>;
  wasm: string;
  zkey: string;
  vkeyUrl: string;
}): Promise<SolidityProofParts & { publicSignals: string[] }> {
  const snarkjs = await loadSnarkjs();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    params.input,
    params.wasm,
    params.zkey
  );
  const vkey = await (await fetch(params.vkeyUrl)).json();
  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!ok) throw new Error("local proof verification failed");

  const calldata = await snarkjs.groth16.exportSolidityCallData(
    proof,
    publicSignals
  );
  const argv = JSON.parse(`[${calldata}]`) as [
    [string, string],
    [[string, string], [string, string]],
    [string, string],
    string[],
  ];

  return {
    proofA: argv[0].map(String) as [string, string],
    proofB: argv[1].map((row) => row.map(String)) as [
      [string, string],
      [string, string],
    ],
    proofC: argv[2].map(String) as [string, string],
    publicSignals: publicSignals.map(String),
  };
}
