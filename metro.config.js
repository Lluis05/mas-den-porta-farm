// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite al navegador funciona amb WebAssembly. Metro no tracta els .wasm
// com a recurs per defecte, i sense això la versió web no compila.
config.resolver.assetExts.push('wasm');

// El WASM de SQLite necessita SharedArrayBuffer, que el navegador només
// habilita si la pàgina se serveix amb aquestes dues capçaleres.
// Això només afecta el servidor de desenvolupament; en producció les ha de
// posar el servidor que allotgi la web.
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    return middleware(req, res, next);
  };
};

module.exports = config;
