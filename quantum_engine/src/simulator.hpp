#pragma once
#include "types.hpp"
#include "quantum_state.hpp"
using namespace std;

class Simulator {
private:
    QuantumState q_state;

public:
    Simulator(int num_qubits);
    void run(const vector<Instruction>& circuit);
    vector<double> get_probabilities() const;
    vector<double> get_statevector() const;
};