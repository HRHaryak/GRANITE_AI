const fs = require('fs');
const path = require('path');

const files = [
  'app/blocks/[id]/BlockDetailClient.tsx',
  'components/analysis/PointCloud3DViewer.tsx',
  'app/page.tsx',
  'app/dashboard/page.tsx',
  'app/blocks/page.tsx',
  'app/capture/page.tsx',
  'app/quarries/page.tsx',
  'app/profile/page.tsx',
  'components/layout/AppHeader.tsx',
  'components/layout/BottomNavigation.tsx',
  'components/analysis/Cutting3DViewer.tsx'
];

function replaceColors(content) {
  let c = content;
  
  // Backgrounds
  c = c.replace(/bg-\[#0a0b0d\]/g, 'bg-[var(--background)]');
  c = c.replace(/bg-\[#121416\]/g, 'bg-[var(--surface)]');
  c = c.replace(/bg-\[#1a1d21\]/g, 'bg-[var(--surface-elevated)]');
  
  // Texts
  // Only replace text-white if not part of text-white/50 etc and not after dark:
  c = c.replace(/(?<!dark:)text-white(?!\/)/g, 'text-[var(--text-primary)]');
  
  // Muted and secondary texts
  c = c.replace(/(?<!dark:)text-slate-400/g, 'text-[var(--text-muted)]');
  c = c.replace(/(?<!dark:)text-slate-300/g, 'text-[var(--text-secondary)]');
  c = c.replace(/(?<!dark:)text-white\/60/g, 'text-[var(--text-muted)]');
  c = c.replace(/(?<!dark:)text-white\/50/g, 'text-[var(--text-muted)]');
  c = c.replace(/(?<!dark:)text-white\/40/g, 'text-[var(--text-muted)]');
  c = c.replace(/(?<!dark:)text-white\/70/g, 'text-[var(--text-secondary)]');
  c = c.replace(/(?<!dark:)text-white\/80/g, 'text-[var(--text-primary)]');
  c = c.replace(/(?<!dark:)text-white\/90/g, 'text-[var(--text-primary)]');
  
  // Borders
  c = c.replace(/(?<!dark:)border-white\/10/g, 'border-[var(--border)]');
  c = c.replace(/(?<!dark:)border-white\/15/g, 'border-[var(--border)]');
  
  // Surfaces
  c = c.replace(/(?<!dark:)bg-white\/5(?!\d)/g, 'bg-[var(--surface-elevated)]');
  c = c.replace(/(?<!dark:)bg-white\/\[\.02\]/g, 'bg-[var(--surface)]');
  c = c.replace(/(?<!dark:)bg-white\/\[\.05\]/g, 'bg-[var(--surface-elevated)]');

  // Fix PointCloud3DViewer and Cutting3DViewer canvas colors if any
  // Note: For canvas hardcoded values, we might need manual fixes. Let's just do CSS for now.
  return c;
}

const basePath = 'C:/Users/hrhar/Project/granitemeasure-ai/frontend';

files.forEach(f => {
  const fullPath = path.join(basePath, f);
  if (fs.existsSync(fullPath)) {
    const orig = fs.readFileSync(fullPath, 'utf8');
    const changed = replaceColors(orig);
    if (orig !== changed) {
      fs.writeFileSync(fullPath, changed, 'utf8');
      console.log('Updated ' + f);
    }
  } else {
    console.log('Not found: ' + f);
  }
});
