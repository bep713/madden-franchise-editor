// CI-only: rewrites package.json's version to <major>.<minor>.<patch+1>-nightly.<GITHUB_RUN_NUMBER>
// and prints the new version. Never commit the result.
// Usage: node scripts/set-nightly-version.js [path/to/package.json]
const fs = require('fs');
const path = require('path');

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

const version = `${match[1]}.${match[2]}.${Number(match[3]) + 1}-nightly.${runNumber}`;
pkg.version = version;

fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
console.log(version);
