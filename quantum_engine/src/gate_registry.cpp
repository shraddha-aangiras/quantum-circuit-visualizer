#include "gate_registry.hpp"
#include <cmath> 
using namespace std;

namespace GateRegistry {
    const double inv_sqrt2 = M_SQRT1_2;
    
    const Matrix2x2 H = {
        Complex(inv_sqrt2, 0), Complex(inv_sqrt2, 0), 
        Complex(inv_sqrt2, 0), Complex(-inv_sqrt2, 0)
    };
    
    const Matrix2x2 X = {
        Complex(0, 0), Complex(1, 0), 
        Complex(1, 0), Complex(0, 0)
    };
    
    const Matrix2x2 Z = {
        Complex(1, 0), Complex(0, 0), 
        Complex(0, 0), Complex(-1, 0)
    };

    const Matrix2x2 Y = {
        Complex(0, 0), Complex(0, -1),
        Complex(0, 1), Complex(0,  0)
    };

    const Matrix2x2 T = {
        Complex(1, 0), Complex(0, 0),
        Complex(0, 0), Complex(inv_sqrt2, inv_sqrt2)
    };

    const unordered_map<string, Matrix2x2> base_gates = {
        {"H", H},
        {"X", X},
        {"Y", Y},
        {"Z", Z},
        {"T", T},
        {"Y", Y}
    };
}