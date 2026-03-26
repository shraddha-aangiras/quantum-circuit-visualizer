#include "simulator.hpp"
#include "gate_registry.hpp"
#include <stdexcept>
using namespace std;

Simulator::Simulator(int num_qubits) : q_state(num_qubits) {}

void Simulator::run(const vector<Instruction>& circuit) {
    for (const auto& inst : circuit) {
        if (inst.name == "CNOT") {
            q_state.apply_cnot(inst.qubits[0], inst.qubits[1]);
        } else {
            auto it = GateRegistry::base_gates.find(inst.name);
            if (it != GateRegistry::base_gates.end()) {
                q_state.apply_1q_gate(it->second, inst.qubits[0]);
            } else {
                throw invalid_argument("Gate not found: " + inst.name);
            }
        }
    }
}

vector<double> Simulator::get_probabilities() const {
    const auto& state = q_state.get_state();
    vector<double> probs(state.size());
    for (size_t i = 0; i < state.size(); ++i) {
        probs[i] = norm(state[i]);
    }
    return probs;
}

vector<double> Simulator::get_statevector() const {
    vector<double> flat_state;
    const auto& state = q_state.get_state();
    for (size_t i = 0; i < state.size(); i++) {
        flat_state.push_back(state[i].real());
        flat_state.push_back(state[i].imag());
    }
    return flat_state;
}