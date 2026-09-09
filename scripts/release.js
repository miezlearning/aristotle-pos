/**
 * Automation Script for Aristotle POS Releases
 * Usage:
 *   node scripts/release.js [versionName] [changelog items...]
 * Examples:
 *   node scripts/release.js 1.1.4 "Fitur Tiket Dapur" "Peningkatan printer"
 *   node scripts/release.js patch "Perbaikan bug minor"
 */

import fs from 'fs';
import path from 'path';

const versionJsonPath = path.resolve('version.json');
const gradlePath = path.resolve('android/app/build.gradle');
const indexPath = path.resolve('index.html');
const releaseNotesPath = path.resolve('RELEASE_NOTES.md');

if (!fs.existsSync(versionJsonPath)) {
  console.error('Error: version.json not found!');
  process.exit(1);
}

const currentVersionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
let currentCode = currentVersionData.versionCode || 5;
let currentName = currentVersionData.versionName || '1.1.3';

const args = process.argv.slice(2);
let targetVersion = args[0];
let changelogArgs = args.slice(1);

if (!targetVersion || targetVersion === 'patch') {
  const parts = currentName.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  targetVersion = parts.join('.');
} else if (targetVersion === 'minor') {
  const parts = currentName.split('.').map(Number);
  parts[1] = (parts[1] || 0) + 1;
  parts[2] = 0;
  targetVersion = parts.join('.');
}

const newVersionCode = currentCode + 1;
const today = new Date().toISOString().split('T')[0];
const changelog = changelogArgs.length > 0 
  ? changelogArgs 
  : currentVersionData.changelog || ['Peningkatan performa dan stabilitas aplikasi'];

console.log(`Bumping version: v${currentName} (code ${currentCode}) -> v${targetVersion} (code ${newVersionCode})`);

// 1. Update version.json
const updatedVersionData = {
  versionCode: newVersionCode,
  versionName: targetVersion,
  apkUrl: `https://github.com/miezlearning/aristotle-pos/releases/download/v${targetVersion}/Aristotle-POS.apk`,
  changelog: changelog,
  releaseDate: today
};
fs.writeFileSync(versionJsonPath, JSON.stringify(updatedVersionData, null, 2) + '\n');
console.log('Updated version.json');

// 2. Update android/app/build.gradle
if (fs.existsSync(gradlePath)) {
  let gradleContent = fs.readFileSync(gradlePath, 'utf-8');
  gradleContent = gradleContent.replace(/def appVersionCode = [^\n]+/, `def appVersionCode = project.hasProperty('customVersionCode') ? project.property('customVersionCode').toInteger() : ${newVersionCode}`);
  gradleContent = gradleContent.replace(/def appVersionName = [^\n]+/, `def appVersionName = project.hasProperty('customVersionName') ? project.property('customVersionName') : "${targetVersion}"`);
  fs.writeFileSync(gradlePath, gradleContent);
  console.log('Updated android/app/build.gradle');
}

// 3. Update index.html badges
if (fs.existsSync(indexPath)) {
  let indexContent = fs.readFileSync(indexPath, 'utf-8');
  indexContent = indexContent.replace(/<span id="appVersionBadge"[^>]*>v[^<]+<\/span>/, `<span id="appVersionBadge" class="hidden">v${targetVersion}</span>`);
  indexContent = indexContent.replace(/<p id="appVersionLabel"[^>]*>v[^<]+<\/p>/, `<p id="appVersionLabel" class="text-[10px] text-stone-500 truncate mt-0.5">v${targetVersion} (Terkini)</p>`);
  indexContent = indexContent.replace(/<span id="updateModalVersionBadge"[^>]*>v[^<]+<\/span>/, `<span id="updateModalVersionBadge" class="px-2 py-0.5 rounded-full bg-amber-400 text-stone-900 font-black text-[10px] tracking-wide shadow-sm">v${targetVersion}</span>`);
  fs.writeFileSync(indexPath, indexContent);
  console.log('Updated index.html badges');
}

// 4. Update package.json
const pkgPath = path.resolve('package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pkg.version = targetVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('Updated package.json');
}

// 5. Update sw.js CACHE_NAME
const swPath = path.resolve('sw.js');
if (fs.existsSync(swPath)) {
  let swContent = fs.readFileSync(swPath, 'utf-8');
  swContent = swContent.replace(/const CACHE_NAME = 'aristotle-pos-v[^']+';/, `const CACHE_NAME = 'aristotle-pos-v${newVersionCode}';`);
  fs.writeFileSync(swPath, swContent);
  console.log('Updated sw.js CACHE_NAME');
}

// 5. Update RELEASE_NOTES.md
let notes = `# Aristotle POS v${targetVersion} Release Notes\n\n`;
notes += `**Tanggal Rilis:** ${today}\n\n`;
notes += `### Catatan Pembaruan:\n`;
changelog.forEach(item => {
  notes += `- ${item}\n`;
});
notes += `\n---\n*Pembaruan ini dapat diunduh dan dipasang langsung dari dalam aplikasi (In-App Auto-Updater).*`;
fs.writeFileSync(releaseNotesPath, notes);
console.log('Updated RELEASE_NOTES.md');

// 6. Sync to Android Assets
const assetsDir = path.resolve('android/app/src/main/assets');
if (fs.existsSync(assetsDir)) {
  ['index.html', 'version.json', 'sw.js'].forEach(f => {
    const src = path.resolve(f);
    const dest = path.join(assetsDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`Synced ${f} to android assets`);
    }
  });

  ['js', 'css', 'fonts'].forEach(dir => {
    const srcDir = path.resolve(dir);
    const destDir = path.join(assetsDir, dir);
    if (fs.existsSync(srcDir)) {
      fs.cpSync(srcDir, destDir, { recursive: true });
      console.log(`Synced ${dir}/ recursively to android assets`);
    }
  });
}

console.log(`\nBerhasil memperbarui ke v${targetVersion}! Tinggal 'git commit' dan 'git push' ke master untuk memicu rilis CI/CD otomatis.`);

