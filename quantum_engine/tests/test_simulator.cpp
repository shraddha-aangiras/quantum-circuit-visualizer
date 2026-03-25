#include <gtest/gtest.h>
#include "../src/simulator.hpp"
#include "../src/types.hpp"

TEST(QuantumEngineTest, BellStateEntanglement) {
    // Create a 2-qubit simulator
    Simulator sim(2);

    // Build the Bell State circuit: H on 0, CNOT 0 -> 1
    std::vector<Instruction> circuit = {
        {"H", {0}},
        {"CNOT", {0, 1}}
    };

    // Run the simulation
    sim.run(circuit);

    // Get the resulting probabilities
    std::vector<double> probs = sim.get_probabilities();

    // In a Bell state, indices 0 (|00>) and 3 (|11>) should be 0.5.
    // Indices 1 (|01>) and 2 (|10>) should be 0.0.
    // We use EXPECT_NEAR to account for minor floating-point rounding errors.
    EXPECT_NEAR(probs[0], 0.5, 1e-5);
    EXPECT_NEAR(probs[1], 0.0, 1e-5);
    EXPECT_NEAR(probs[2], 0.0, 1e-5);
    EXPECT_NEAR(probs[3], 0.5, 1e-5);
}