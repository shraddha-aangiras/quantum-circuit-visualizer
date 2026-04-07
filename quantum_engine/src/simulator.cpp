#include "simulator.hpp"
#include "gate_registry.hpp"
#include <stdexcept>
using namespace std;

Simulator::Simulator(int n) : num_qubits(n), q_state(n), classical_bits(n, -1) {}

void Simulator::run(const vector<Instruction>& circuit) {
    fill(classical_bits.begin(), classical_bits.end(), -1);

    for (const auto& inst : circuit) {
        if (inst.name == "CNOT") {
            q_state.apply_cnot(inst.qubits[0], inst.qubits[1]);

        } else if (inst.name == "CZ") {
            q_state.apply_cz(inst.qubits[0], inst.qubits[1]);

        } else if (inst.name == "MEASURE") {
            int q = inst.qubits[0];
            classical_bits[q] = q_state.measure_qubit(q);

        } else if (inst.name == "FF_x") {
            // qubits[0] = source (measured), qubits[1] = target
            int src = inst.qubits[0], tgt = inst.qubits[1];
            if (classical_bits[src] == 1)
                q_state.apply_1q_gate(GateRegistry::base_gates.at("X"), tgt);

        } else if (inst.name == "FF_Z") {
            int src = inst.qubits[0], tgt = inst.qubits[1];
            if (classical_bits[src] == 1)
                q_state.apply_1q_gate(GateRegistry::base_gates.at("Z"), tgt);

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
    for (size_t i = 0; i < state.size(); ++i)
        probs[i] = norm(state[i]);
    return probs;
}

vector<double> Simulator::get_statevector() const {
    vector<double> flat;
    const auto& state = q_state.get_state();
    for (size_t i = 0; i < state.size(); i++) {
        flat.push_back(state[i].real());
        flat.push_back(state[i].imag());
    }
    return flat;
}

double Simulator::get_expectation_z(int target_qubit) const {
    const auto& state = q_state.get_state();
    int num_states = state.size();

    int nq = 0;
    while ((1 << nq) < num_states) nq++;

    double exp_val = 0.0;
    for (int i = 0; i < num_states; i++) {
        int bit = (i >> (nq - 1 - target_qubit)) & 1;
        double p = norm(state[i]);
        exp_val += (bit == 0) ? p : -p;
    }
    return exp_val;
}

vector<int> Simulator::get_classical_bits() const {
    return classical_bits;
}
