// Style-guide hints: advisory only, derived from the «لُب» design system's voice rules.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
const wranglerRequire=createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
const {build}=wranglerRequire('esbuild');
mkdirSync('.sites-runtime',{recursive:true});
const outfile='.sites-runtime/test-model.mjs';
await build({entryPoints:['lib/model.ts'],bundle:true,format:'esm',platform:'neutral',outfile,logLevel:'error'});
const {styleHints}=await import('../'+outfile);
assert.deepEqual(styleHints(['لماذا ارتفعت الإيجارات؟ ثلاثة أسباب']),[],'a plain question headline passes');
assert.deepEqual(styleHints(['ارتفع الإيجار 12٪','المصدر: الهيئة العامة للإحصاء، 2026']),[],'figure with Arabic percent and source line passes');
const all=styleHints(['لن تصدق ما حدث!! 🔥 ارتفع ١٢ %']).join(' ');
for(const m of ['رموز تعبيرية','تشويقًا فارغًا','التعجب','الأرقام الغربية','سطر «المصدر'])assert.ok(all.includes(m),m);
assert.ok(styleHints(['ارتفع 12 %']).some(h=>h.includes('«٪»')),'Latin percent sign');
console.log('PASS: style-guide hints (emoji, clickbait, exclamation, Eastern digits, percent sign, source line)');
