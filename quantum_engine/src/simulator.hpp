#pragma once
#include "types.hpp"
#include "quantum_state.hpp"

class Simulator {
private:
    QuantumState q_state;

public:
    Simulator(int num_qubits);
    void run(const std::vector<Instruction>& circuit);
    std::vector<double> get_probabilities() const;
};