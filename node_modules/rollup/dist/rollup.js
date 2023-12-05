/*
  @license
	Rollup.js v4.6.1
	Thu, 30 Nov 2023 05:22:35 GMT - commit ded37aa8f95d5ba9786fa8903ef3424fd0549c73

	https://github.com/rollup/rollup

	Released under the MIT License.
*/
'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const rollup = require('./shared/rollup.js');
const watchProxy = require('./shared/watch-proxy.js');
require('./shared/parseAst.js');
require('./native.js');
require('node:path');
require('node:process');
require('tty');
require('path');
require('node:perf_hooks');
require('node:fs/promises');
require('./shared/fsevents-importer.js');



exports.VERSION = rollup.version;
exports.defineConfig = rollup.defineConfig;
exports.rollup = rollup.rollup;
exports.watch = watchProxy.watch;
//# sourceMappingURL=rollup.js.map
