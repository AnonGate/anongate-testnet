declare module "circomlibjs" {
  export function buildPoseidon(): Promise<
    ((inputs: unknown[]) => unknown) & {
      F: {
        e: (value: string | number | bigint) => unknown;
        toString: (value: unknown) => string;
      };
    }
  >;
}
