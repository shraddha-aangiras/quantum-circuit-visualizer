#!/bin/bash

mkdir -p ../quantum_ui/src/wasm/

echo "Compiling C++ Math Engine to WebAssembly..."

emcc src/gate_registry.cpp src/quantum_state.cpp src/simulator.cpp src/wasm_bindings.cpp \
  -I src \
  -O3 \
  -lembind \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s ENVIRONMENT=web \
  -o ../quantum_ui/src/wasm/quantum_engine.js

echo "Build complete! Output saved to ../quantum_ui/src/wasm/quantum_engine.js and ../quantum_ui/src/wasm/quantum_engine.wasm"