#pragma once
#include "types.hpp"

class QuantumState {
private:
    int num_qubits;
    std::vector<Complex> state;

public:
    QuantumState(int n);
    void apply_1q_gate(const Matrix2x2& matrix, int target_qubit);
    void apply_cnot(int control, int target);
    const std::vector<Complex>& get_state() const;
};