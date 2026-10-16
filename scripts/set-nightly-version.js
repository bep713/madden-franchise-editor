// CI-only: rewrites package.json's version to a nightly prerelease and prints the new version.
// Never commit the result.
//   - If package.json's version has not been released yet (no git tag v<version> on origin),
//     the nightly previews it: 4.6.0 -> 4.6.0-nightly.<GITHUB_RUN_NUMBER>.
//   - If it has been released, the nightly previews the next patch: 4.6.0 -> 4.6.1-nightly.<GITHUB_RUN_NUMBER>.
// Either way the nightly sorts above the latest stable and below the next one.
// Set VERSION_RELEASED=true|false to skip the git lookup (useful for local testing).
// Usage: node scripts/set-nightly-version.js [path/to/package.json]
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const runNumber = process.env.GITHUB_RUN_NUMBER;

if (!/^\d+$/.test(runNumber || '')) {
    console.error('GITHUB_RUN_NUMBER must be set to a number.');
    process.exit(1);
}

const packagePath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'package.json'));
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const match = /^(\d+)\.(\d+)\.(\d+)(?:-.*)?$/.exec(pkg.version);

if (!match) {
    console.error(`Unable to parse version: ${pkg.version}`);
    process.exit(1);
}

const [, major, minor, patch] = match;
const baseVersion = `${major}.${minor}.${patch}`;
const released = isReleased(baseVersion);
const nextVersion = released ? `${major}.${minor}.${Number(patch) + 1}` : baseVersion;

const version = `${nextVersion}-nightly.${runNumber}`;
pkg.version = version;

fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
console.error(`v${baseVersion} ${released ? 'is' : 'is not'} released; nightly version is ${version}`);
console.log(version);

function isReleased(baseVersion) {
    const override = process.env.VERSION_RELEASED;
    if (override === 'true' || override === 'false') {
        return override === 'true';
    }

    // --exit-code: 0 = tag found, 2 = not found, anything else = git/network error.
    const result = spawnSync('git', ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/v${baseVersion}`], {
        encoding: 'utf8',
    });

    if (result.status === 0) {
        return true;
    }
    if (result.status === 2) {
        return false;
    }

    console.error(`Unable to check for tag v${baseVersion}: ${result.error?.message || result.stderr}`);
    process.exit(1);
}
