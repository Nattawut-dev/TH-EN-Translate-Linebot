import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const compiled = fs.mkdtempSync(path.join(os.tmpdir(), 'th-de-tests-'));
for (const name of fs.readdirSync(path.join(root, 'lib')).filter(name => name.endsWith('.ts'))) {
  const source = fs.readFileSync(path.join(root, 'lib', name), 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  fs.writeFileSync(path.join(compiled, name.replace(/\.ts$/, '.js')), result.outputText);
}
export function loadModule(name) { return require(path.join(compiled, name + '.js')); }
process.on('exit', () => fs.rmSync(compiled, { recursive: true, force: true }));
