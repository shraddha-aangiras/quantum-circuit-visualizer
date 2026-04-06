#pragma once
#include "types.hpp"
#include "quantum_state.hpp"
using namespace std;

class Simulator {
private:
    int num_qubits;
    QuantumState q_state;
    vector<int> classical_bits;  // -1 = unmeasured, 0/1 = measured outcome

public:
    Simulator(int num_qubits);
    void run(const vector<Instruction>& circuit);
    vector<double> get_probabilities() const;
    vector<double> get_statevector() const;
    double get_expectation_z(int target_qubit) const;
    vector<int> get_classical_bits() const;
};
