module.exports = {
  "forbidden": [
    {
      "name": "no-circular",
      "severity": "error",
      "comment": "Circular dependencies make ownership and execution order harder to reason about.",
      "from": {},
      "to": {
        "circular": true
      }
    },
    {
      "name": "no-packages-to-apps",
      "severity": "error",
      "comment": "Shared packages must not depend on application code.",
      "from": {
        "path": "^packages/"
      },
      "to": {
        "path": "^apps/"
      }
    }
  ],
  "options": {
    "doNotFollow": {
      "path": "^node_modules"
    },
    "exclude": {
      "path": "(^|/)(\\.vite|dist|coverage|test-results|tmp|node_modules)/"
    },
    "reporterOptions": {
      "dot": {
        "collapsePattern": "^(apps|packages)/[^/]+/"
      }
    },
    "tsConfig": {
      "fileName": "tsconfig.base.json"
    }
  }
};
