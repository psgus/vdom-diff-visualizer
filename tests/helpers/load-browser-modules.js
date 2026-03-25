const fs = require("fs");
const path = require("path");
const vm = require("vm");

function createSandbox() {
  const sandbox = {
    console,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Math,
    JSON,
    window: { VDOMApp: {} },
    document: {
      addEventListener() {},
      createElement() {
        throw new Error("document.createElement is not available in unit tests");
      },
      createElementNS() {
        throw new Error("document.createElementNS is not available in unit tests");
      }
    },
    Node: {
      ELEMENT_NODE: 1,
      TEXT_NODE: 3
    }
  };

  sandbox.window.window = sandbox.window;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

function loadModules(files) {
  const rootDir = path.resolve(__dirname, "..", "..");
  const sandbox = createSandbox();

  files.forEach(function (file) {
    const source = fs.readFileSync(path.join(rootDir, file), "utf8");
    vm.runInContext(source, sandbox, { filename: file });
  });

  return sandbox.window.VDOMApp;
}

module.exports = {
  loadModules
};
