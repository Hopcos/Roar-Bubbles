#!/usr/bin/env node
/**
 * Bundles src/index.html into a single self-contained page: dist/index.html
 * - local <script src="js/..."> are inlined
 * - local <link rel="stylesheet" href="css/..."> are inlined
 * - remote (https) scripts such as three.js stay as CDN references
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function build(options = {}) {
  const srcDir = options.srcDir || SRC;
  const outFile = options.outFile || path.join(ROOT, 'dist', 'index.html');
  let html = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
  const inlined = [];

  html = html.replace(/<link\s+rel="stylesheet"\s+href="(?!https?:)([^"]+)"\s*\/?>/g, (m, href) => {
    const css = fs.readFileSync(path.join(srcDir, href), 'utf8');
    inlined.push(href);
    return '<style>\n/* ' + href + ' */\n' + css + '\n</style>';
  });

  html = html.replace(/<script\s+src="(?!https?:)([^"]+)"><\/script>/g, (m, src) => {
    // escape closing script tags inside the code
    const js = fs.readFileSync(path.join(srcDir, src), 'utf8').replace(/<\/script/gi, '<\\/script');
    inlined.push(src);
    return '<script>\n/* ' + src + ' */\n' + js + '\n</script>';
  });

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  html = html.replace('<head>', '<head>\n  <!-- RoarBubbles v' + pkg.version + ' | MIT License | single-file build -->');

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  return { outFile, inlined, bytes: Buffer.byteLength(html) };
}

if (require.main === module) {
  const res = build();
  console.log('Built ' + path.relative(ROOT, res.outFile) + ' (' + (res.bytes / 1024).toFixed(1) + ' KB, ' + res.inlined.length + ' files inlined)');
}

module.exports = { build };
