import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPackageTrain } from '../check-copilotkit-train.mjs';

const lock = Object.freeze({
  copilotKit: '1.67.1',
  agUi: '0.0.57',
});

test('accepts the exact locked CopilotKit and AG-UI package train', () => {
  assert.doesNotThrow(() =>
    assertPackageTrain(
      {
        '@copilotkit/react-core': '1.67.1',
        '@copilotkit/runtime': '1.67.1',
        '@ag-ui/client': '0.0.57',
        '@ag-ui/core': '0.0.57',
      },
      lock,
    ),
  );
});

test('rejects ranges and mixed package versions', () => {
  assert.throws(
    () =>
      assertPackageTrain(
        {
          '@copilotkit/react-core': '^1.67.1',
          '@copilotkit/runtime': '1.67.1',
          '@ag-ui/client': '0.0.57',
          '@ag-ui/core': '0.0.57',
        },
        lock,
      ),
    /must equal exact locked version/,
  );

  assert.throws(
    () =>
      assertPackageTrain(
        {
          '@copilotkit/react-core': '1.67.1',
          '@copilotkit/runtime': '1.66.2',
          '@ag-ui/client': '0.0.57',
          '@ag-ui/core': '0.0.57',
        },
        lock,
      ),
    /must equal exact locked version/,
  );
});

test('rejects the React UI package removed from the v2 train', () => {
  assert.throws(
    () =>
      assertPackageTrain(
        {
          '@copilotkit/react-core': '1.67.1',
          '@copilotkit/react-ui': '1.67.1',
        },
        lock,
      ),
    /removed from the v2 train/,
  );
});
