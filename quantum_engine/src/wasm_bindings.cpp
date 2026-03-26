#include <emscripten/bind.h>
#include "simulator.hpp"
#include "types.hpp"

using namespace emscripten;

// JS sees this (?)
EMSCRIPTEN_BINDINGS(quantum_module) {
    
    // Telling wasm to convert JS array to C++ vector
    register_vector<int>("VectorInt");
    register_vector<double>("VectorDouble");
    register_vector<Instruction>("VectorInstruction");

    // Telling wasm to map JS Object to C++ Instruction struct
    // Allows JS to send: { name: "H", qubits: [0] }
    value_object<Instruction>("Instruction")
        .field("name", &Instruction::name)
        .field("qubits", &Instruction::qubits);

    // Expose Simulator class and its methods
    class_<Simulator>("Simulator")
        .constructor<int>()
        .function("run", &Simulator::run)
        .function("get_probabilities", &Simulator::get_probabilities)
        .function("get_statevector", &Simulator::get_statevector);
}