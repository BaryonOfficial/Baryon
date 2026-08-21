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
    },
    {
      "name": "no-engine-root-barrel",
      "severity": "error",
      "comment": "Engine consumers must name the owning public subpath instead of importing an aggregate root barrel.",
      "from": {
        "path": "^(apps|packages)/",
        "pathNot": "^packages/engine/"
      },
      "to": {
        "path": "^@baryon/engine$"
      }
    },
    {
      "name": "engine-no-react-ui",
      "severity": "error",
      "comment": "The engine is headless; React lifecycle and presentation belong to app-shell.",
      "from": {
        "path": "^packages/engine/"
      },
      "to": {
        "path": "^(react|react-dom)(/|$)"
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
