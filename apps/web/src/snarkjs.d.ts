declare module "snarkjs" {
  const snarkjs: {
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
  export default snarkjs;
}
