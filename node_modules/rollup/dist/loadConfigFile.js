/*
  @license
	Rollup.js v4.6.1
	Thu, 30 Nov 2023 05:22:35 GMT - commit ded37aa8f95d5ba9786fa8903ef3424fd0549c73

	https://github.com/rollup/rollup

	Released under the MIT License.
*/
'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

require('node:fs/promises');
require('node:path');
require('node:process');
require('node:url');
require('./shared/rollup.js');
require('./shared/parseAst.js');
const loadConfigFile_js = require('./shared/loadConfigFile.js');
require('tty');
require('path');
require('node:perf_hooks');
require('./native.js');
require('./getLogFilter.js');



exports.loadConfigFile = loadConfigFile_js.loadConfigFile;
//# sourceMappingURL=loadConfigFile.js.map
