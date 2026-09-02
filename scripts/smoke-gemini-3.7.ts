/**
 * Standalone Smoke Test Wrapper for Gemini Flash Vision OCR.
 */

export type { SmokeErrorClassification } from './smoke-gemini-3.6';
export {
  classifyGeminiError,
  runGemini36SmokeTest as runGemini37SmokeTest,
} from './smoke-gemini-3.6';

import { runGemini36SmokeTest } from './smoke-gemini-3.6';

if (require.main === module || (process.argv[1] && process.argv[1].includes('smoke-gemini-3.7'))) {
  runGemini36SmokeTest().then((res) => {
    if (res.status === 'FAIL') {
      process.exit(1);
    }
  });
}
