#include <emscripten/bind.h>
#include "simulator.hpp"
#include "types.hpp"

using namespace emscripten;

EMSCRIPTEN_BINDINGS(quantum_module) {

    register_vector<int>("VectorInt");
    register_vector<double>("VectorDouble");
    register_vector<Instruction>("VectorInstruction");

    value_object<Instruction>("Instruction")
        .field("name", &Instruction::name)
        .field("qubits", &Instruction::qubits);

    class_<Simulator>("Simulator")
        .constructor<int>()
        .function("run",                &Simulator::run)
        .function("get_probabilities",  &Simulator::get_probabilities)
        .function("get_statevector",    &Simulator::get_statevector)
        .function("get_expectation_z",  &Simulator::get_expectation_z)
        .function("get_classical_bits", &Simulator::get_classical_bits);
}
