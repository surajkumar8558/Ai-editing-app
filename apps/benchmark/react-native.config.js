// onnxruntime-react-native ships a legacy `unimodule.json`, which makes autolinking skip it:
// its native code is compiled in but the React package is never registered, so
// NativeModules.Onnxruntime is null at runtime. Register it explicitly.
module.exports = {
  dependencies: {
    'onnxruntime-react-native': {
      platforms: {
        android: {
          sourceDir: 'android', // relative to the package root
          packageImportPath: 'import ai.onnxruntime.reactnative.OnnxruntimePackage;',
          packageInstance: 'new OnnxruntimePackage()',
        },
      },
    },
  },
};
