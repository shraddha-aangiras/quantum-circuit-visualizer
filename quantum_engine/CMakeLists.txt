cmake_minimum_required(VERSION 3.14)
set(CMAKE_POLICY_DEFAULT_CMP0135 NEW)
project(QuantumEngine VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Math library
add_library(quantum_engine
    src/gate_registry.cpp
    src/quantum_state.cpp
    src/simulator.cpp
)

target_include_directories(quantum_engine PUBLIC src)

# GoogleTest setup
include(FetchContent)
FetchContent_Declare(
  googletest
  URL https://github.com/google/googletest/archive/refs/tags/v1.14.0.zip
)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)


enable_testing()
add_executable(engine_tests tests/test_simulator.cpp)

target_link_libraries(engine_tests
    PRIVATE
        quantum_engine
        gtest_main
)

include(GoogleTest)
gtest_discover_tests(engine_tests)