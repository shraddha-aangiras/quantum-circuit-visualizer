#include <gtest/gtest.h>
#include "../src/simulator.hpp"
#include "../src/types.hpp"

TEST(QuantumEngineTest, BellStateEntanglement) {
    // Create a 2-qubit simulator
    Simulator sim(2);

    // Build the Bell State circuit
    std::vector<Instruction> circuit = {
        {"H", {0}},
        {"CNOT", {0, 1}}
    };

    // Run 
    sim.run(circuit);

    // Get probabilities
    std::vector<double> probs = sim.get_probabilities();

    EXPECT_NEAR(probs[0], 0.5, 1e-5);
    EXPECT_NEAR(probs[1], 0.0, 1e-5);
    EXPECT_NEAR(probs[2], 0.0, 1e-5);
    EXPECT_NEAR(probs[3], 0.5, 1e-5);
}

TEST(QuantumEngineTest, HXZSuperposition) {
    Simulator sim(2);

    std::vector<Instruction> circuit = {
        {"T", {0}}
    };

    sim.run(circuit);

    std::vector<double> probs = sim.get_probabilities();

    EXPECT_NEAR(probs[0], 1, 1e-5); 
    EXPECT_NEAR(probs[1], 0, 1e-5); 
    EXPECT_NEAR(probs[2], 0.0, 1e-5);
    EXPECT_NEAR(probs[3], 0.0, 1e-5);
}