#include "quantum_state.hpp"
#include <random>
#include <cmath>
using namespace std;

QuantumState::QuantumState(int n) : num_qubits(n), state(1ull << n, {0.0, 0.0}) {
    state[0] = {1.0, 0.0};
}

void QuantumState::apply_1q_gate(const Matrix2x2& matrix, int target_qubit) {
    size_t bit_pos = num_qubits - 1 - target_qubit;
    size_t mask = (1ull << bit_pos) - 1;
    size_t half_size = 1ull << (num_qubits - 1);

    for (size_t i = 0; i < half_size; ++i) {
        size_t idx0 = (i & mask) | ((i & ~mask) << 1);
        size_t idx1 = idx0 | (1ull << bit_pos);

        Complex a0 = state[idx0];
        Complex a1 = state[idx1];

        state[idx0] = matrix[0] * a0 + matrix[1] * a1;
        state[idx1] = matrix[2] * a0 + matrix[3] * a1;
    }
}

void QuantumState::apply_cnot(int control, int target) {
    size_t c_pos = num_qubits - 1 - control;
    size_t t_pos = num_qubits - 1 - target;
    size_t t_mask = 1ull << t_pos;
    size_t c_mask = 1ull << c_pos;
    size_t full_size = 1ull << num_qubits;

    for (size_t i = 0; i < full_size; ++i) {
        if (((i & c_mask) != 0) && ((i & t_mask) == 0)) {
            size_t swap_idx = i | t_mask;
            swap(state[i], state[swap_idx]);
        }
    }
}

int QuantumState::measure_qubit(int qubit) {
    size_t bit_pos  = num_qubits - 1 - qubit;
    size_t full_size = 1ull << num_qubits;

    // P(outcome = 0)
    double prob0 = 0.0;
    for (size_t i = 0; i < full_size; ++i) {
        if (((i >> bit_pos) & 1) == 0)
            prob0 += norm(state[i]);
    }

    // Sample outcome with thread-local RNG
    static thread_local mt19937 rng{random_device{}()};
    uniform_real_distribution<double> dist(0.0, 1.0);
    int outcome = (dist(rng) < prob0) ? 0 : 1;

    // Collapse: zero out inconsistent amplitudes, renormalize
    double nf = (outcome == 0) ? sqrt(prob0) : sqrt(1.0 - prob0);
    for (size_t i = 0; i < full_size; ++i) {
        if (((i >> bit_pos) & 1) != (size_t)outcome) {
            state[i] = Complex(0.0, 0.0);
        } else if (nf > 1e-12) {
            state[i] /= nf;
        }
    }

    return outcome;
}

const vector<Complex>& QuantumState::get_state() const {
    return state;
}
