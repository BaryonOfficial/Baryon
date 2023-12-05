/*
  @license
	Rollup.js v4.6.1
	Thu, 30 Nov 2023 05:22:35 GMT - commit ded37aa8f95d5ba9786fa8903ef3424fd0549c73

	https://github.com/rollup/rollup

	Released under the MIT License.
*/
export { version as VERSION, defineConfig, rollup, watch } from './shared/node-entry.js';
import './shared/parseAst.js';
import '../native.js';
import 'node:path';
import 'path';
import 'node:process';
import 'node:perf_hooks';
import 'node:fs/promises';
import 'tty';
