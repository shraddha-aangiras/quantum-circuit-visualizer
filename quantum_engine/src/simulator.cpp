#include "simulator.hpp"
#include "gate_registry.hpp"
#include <stdexcept>
using namespace std;

Simulator::Simulator(int n) : num_qubits(n), q_state(n), classical_bits(n, -1) {
    if (n > MAX_QUBITS) throw invalid_argument("Maximum supported qubit count is " + to_string(MAX_QUBITS));
}

void Simulator::run(const vector<Instruction>& circuit) {
    fill(classical_bits.begin(), classical_bits.end(), -1);

    for (const auto& inst : circuit) {
        if (inst.name == "CNOT") {
                if (inst.qubits.size() < 2) throw invalid_argument("CNOT requires 2 qubits");
            q_state.apply_cnot(inst.qubits[0], inst.qubits[1]);

        } else if (inst.name == "CZ") {
                if (inst.qubits.size() < 2) throw invalid_argument("CZ requires 2 qubits");
            q_state.apply_cz(inst.qubits[0], inst.qubits[1]);

        } else if (inst.name == "TOFFOLI") {
                if (inst.qubits.size() < 3) throw invalid_argument("TOFFOLI requires 3 qubits");
            q_state.apply_toffoli(inst.qubits[0], inst.qubits[1], inst.qubits[2]);

        } else if (inst.name == "MEASURE") {
                if (inst.qubits.empty()) throw invalid_argument("MEASURE requires 1 qubit");
            int q = inst.qubits[0];
            classical_bits[q] = q_state.measure_qubit(q);

        } else if (inst.name == "FF_X") {
                if (inst.qubits.size() < 2) throw invalid_argument("FF_X requires 2 qubits");
            // qubits[0] = source (measured), qubits[1] = target
            int src = inst.qubits[0], tgt = inst.qubits[1];
            if (classical_bits[src] == 1)
                q_state.apply_1q_gate(GateRegistry::base_gates.at("X"), tgt);

        } else if (inst.name == "FF_Z") {
                if (inst.qubits.size() < 2) throw invalid_argument("FF_Z requires 2 qubits");
            int src = inst.qubits[0], tgt = inst.qubits[1];
            if (classical_bits[src] == 1)
                q_state.apply_1q_gate(GateRegistry::base_gates.at("Z"), tgt);

        } else {
            auto it = GateRegistry::base_gates.find(inst.name);
            if (it != GateRegistry::base_gates.end()) {
                    if (inst.qubits.empty()) throw invalid_argument(inst.name + " requires 1 qubit");
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

double Simulator::get_expectation_x(int target_qubit) const {
    return get_expectation_arbitrary(target_qubit, GateRegistry::base_gates.at("X"));
}

double Simulator::get_expectation_y(int target_qubit) const {
    return get_expectation_arbitrary(target_qubit, GateRegistry::base_gates.at("Y"));
}

double Simulator::get_expectation_z(int target_qubit) const {
    return get_expectation_arbitrary(target_qubit, GateRegistry::base_gates.at("Z"));
}




double Simulator::get_expectation_arbitrary(int target_qubit, const Matrix2x2& matrix) const {
    
    const auto& state = q_state.get_state();
    int num_states = state.size();

    int nq = 0;
    while ((1 << nq) < num_states) nq++; // num of qubits

    complex<double> exp_val = 0.0;
    int mask = 1 << (nq - 1 - target_qubit); // Mask to isolate target qubit bit

    for (int i = 0; i < num_states; i++) {
        if ((i & mask) == 0) {
            int j = i | mask; 
            
            complex<double> ci = state[i];
            complex<double> cj = state[j];
            
            // <psi| M |psi> = ci* (m00*ci + m01*cj) + cj* (m10*ci + m11*cj)
            exp_val += conj(ci) * (matrix[0] * ci + matrix[1] * cj) + 
                       conj(cj) * (matrix[2] * ci + matrix[3] * cj);
        }
    }
    return real(exp_val);
}

vector<int> Simulator::get_classical_bits() const {
    return classical_bits;
}
