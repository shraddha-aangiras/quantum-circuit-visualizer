#include "simulator.hpp"
#include "gate_registry.hpp"
#include <stdexcept>

Simulator::Simulator(int num_qubits) : q_state(num_qubits) {}

void Simulator::run(const std::vector<Instruction>& circuit) {
    for (const auto& inst : circuit) {
        if (inst.name == "CNOT") {
            q_state.apply_cnot(inst.qubits[0], inst.qubits[1]);
        } else {
            auto it = GateRegistry::base_gates.find(inst.name);
            if (it != GateRegistry::base_gates.end()) {
                q_state.apply_1q_gate(it->second, inst.qubits[0]);
            } else {
                throw std::invalid_argument("Gate not found: " + inst.name);
            }
        }
    }
}

std::vector<double> Simulator::get_probabilities() const {
    const auto& state = q_state.get_state();
    std::vector<double> probs(state.size());
    for (size_t i = 0; i < state.size(); ++i) {
        probs[i] = std::norm(state[i]);
    }
    return probs;
}