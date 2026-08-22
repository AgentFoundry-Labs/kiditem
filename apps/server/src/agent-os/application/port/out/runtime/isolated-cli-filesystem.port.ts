export const ISOLATED_CLI_FILESYSTEM_PORT = Symbol("ISOLATED_CLI_FILESYSTEM_PORT");
export interface IsolatedCliFilesystemPort {
  removeTree(input: { executionId: string; attemptId: string }): Promise<void>;
  exists(input: { executionId: string; attemptId: string }): Promise<boolean>;
}
