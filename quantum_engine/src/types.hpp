#pragma once
#include <complex>
#include <vector>
#include <array>
#include <string>

using Complex = std::complex<double>;
using Matrix2x2 = std::array<Complex, 4>;

struct Instruction {
    std::string name;
    std::vector<int> qubits;
};