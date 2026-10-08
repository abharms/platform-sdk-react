import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vitest = path.join(packageDirectory, 'node_modules', '.bin', 'vitest');
const safariEnvironment = {
  ...process.env,
  VITEST_BROWSER: 'safari',
  VITEST_STORY_TAG: 'shadow-dom,cross-browser',
};
const dryRun = process.argv.includes('--dry-run');
const discoveryTimeout = 90_000;
const storyTimeout = Number(process.env.SAFARI_STORY_TIMEOUT_MS ?? 120_000);
const safariSessionRetryDelay = 2_000;
const safariSessionCreationFailure = 'Could not create a session';
const safariSessionUnavailable = 'Safari instance is already paired with another WebDriver session';

if (!Number.isFinite(storyTimeout) || storyTimeout <= 0) {
  throw new Error('SAFARI_STORY_TIMEOUT_MS must be a positive number');
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runVitest(arguments_, options = {}) {
  return spawnSync(vitest, arguments_, {
    cwd: packageDirectory,
    env: options.environment ?? safariEnvironment,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    timeout: options.timeout,
  });
}

function printCapturedOutput(result) {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'yv-safari-stories-'));
const discoveryPath = path.join(temporaryDirectory, 'stories.json');
let stories;

try {
  const discovery = runVitest(['list', '--project', 'storybook', `--json=${discoveryPath}`], {
    // Discovery is provider-independent. Using Playwright here prevents
    // SafariDriver from opening a throwaway session before the isolated runs.
    environment: {
      ...safariEnvironment,
      VITEST_BROWSER: 'chromium',
      VITEST_STORY_DISCOVERY: '1',
    },
    timeout: discoveryTimeout,
  });
  if (discovery.status !== 0) {
    const detail = discovery.error?.message ?? `exit code ${discovery.status ?? 'unknown'}`;
    throw new Error(`Story discovery failed: ${detail}`);
  }

  stories = JSON.parse(readFileSync(discoveryPath, 'utf8'));
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

if (!Array.isArray(stories) || stories.length === 0) {
  throw new Error('No focused Shadow DOM stories were discovered');
}

const duplicateKeys = stories
  .map(({ file, name }) => `${file}\0${name}`)
  .filter((key, index, keys) => keys.indexOf(key) !== index);
if (duplicateKeys.length > 0) {
  throw new Error('Story discovery returned duplicate file/name pairs');
}

console.log(`Discovered ${stories.length} focused Shadow DOM stories.`);
if (dryRun) {
  for (const { file, name } of stories) {
    console.log(`- ${path.relative(packageDirectory, file)} :: ${name}`);
  }
  process.exit(0);
}

const results = [];
for (const [index, story] of stories.entries()) {
  const relativeFile = path.relative(packageDirectory, story.file);
  const startedAt = Date.now();
  console.log(`\n[${index + 1}/${stories.length}] ${relativeFile} :: ${story.name}`);

  let attempts = 0;
  let retryReason;
  let result;
  do {
    attempts += 1;
    result = runVitest(
      [
        'run',
        '--project',
        'storybook',
        relativeFile,
        '--testNamePattern',
        `^${escapeRegularExpression(story.name)}$`,
        '--reporter=verbose',
        '--no-file-parallelism',
      ],
      { capture: true, timeout: storyTimeout },
    );
    printCapturedOutput(result);

    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const previousSafariSessionStillPaired =
      output.includes(safariSessionCreationFailure) && output.includes(safariSessionUnavailable);
    if (result.status === 0 || !previousSafariSessionStillPaired || attempts === 2) {
      break;
    }

    retryReason = 'SafariDriver retained the previous WebDriver session';
    console.warn(
      `SafariDriver retained the previous session; retrying ${relativeFile} :: ${story.name} once.`,
    );
    await new Promise((resolve) => setTimeout(resolve, safariSessionRetryDelay));
  } while (attempts < 2);

  const timedOut = result.error?.code === 'ETIMEDOUT';
  results.push({
    file: relativeFile,
    name: story.name,
    status: timedOut ? 'timed-out' : result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status,
    attempts,
    retryReason,
    durationSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
  });
}

console.log('\nSafari focused-story summary:');
console.table(results);
console.log(JSON.stringify(results, null, 2));

const unsuccessful = results.filter(({ status }) => status !== 'passed');
if (unsuccessful.length > 0) {
  process.exitCode = 1;
}
