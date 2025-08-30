---
layout: page
title: 'Metro-MPI++: Accelerating Verilog/System Verilog Simulations'
description: A GSoC project to automatically partition and parallelize hardware simulations in Verilator using MPI.
img: assets/img/mmpi-logo.png
importance: 1
category: work
related_publications: false
---

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/mmpi-logo.png" title="Metro-MPI++" class="img-fluid rounded z-depth-1" %}
    </div>
</div>

# Project Description

As modern SoC designs especially manycore-based ones get more and more complex, simulation performance becomes a serious bottleneck. RTL simulation is still the most accurate way to verify digital
designs, but the traditional monolithic simulators don’t scale well when the design has a lot of replicated
blocks like cores or NoC components. This often results in extremely long simulation times, which slows
down development.

Newer simulators do give us the option to do parallel simulation but they lack at one important aspect and that is they fail to give the Simulator(or the compiler that doees the parsing and AST construction) a perspective of the physical structure of the hardware design. Becasue of this, the preprocessing, AST Construction, elaboration and optimization follows a standard approach that a general purpose software language compiler like GCC follows. But unlike C and C++, HDLs carry much more information that are kind-of not visible to the GP compilers. An intuitive example would be the case of gem5, when we are modifying some structurs in gem5 let's say the O3 CPU model than it may happen that we are able to complete the building process of the binary of any architecture i.e. it doesn't throw any errors but despite this it may happen that it fails terribily during the run simulations. ANd this happens because of the same reason, that g++ doesn't know what this code represents and it does exactly the same thing it does with other c++ codes. Apart from this, the current parallel simulation frameworks lacks the ability to scale.

To handle scaling issue, my mentors, Dr. Guillem and Prof. Jonathan have came up with a nice way of parallelizing RTL simulation of OpenPiton, [Metro-MPI](https://ieeexplore.ieee.org/abstract/document/10137080), by manually generating different binaries that can be simulated parallely on different threads across multiple nodes by exploiting the hardware boundaries like the NoC structures and by using Message Passing Interface.

In this project, Metro-MPI++, my goal was to take the same philosophy as in Metro-MPI and enable verilator, an open source system verilog simulator,-
   * To automatically detect the possible partitions that can be simulated parallely.
   * To extract as much information as possible about the connecting interface of these partitions to enable Verilator to take informed descisions.
   * Generate intermediate files and structures needed to insert MPI to do parallel simulations.

## Metro-MPI++ Workflow

I will be describing the entire plan here

## Prerequisite: Migrating Metro MPI to Verilator v5.x

Before implementing the main partitioning and MPI integration features, the first critical step was to make Metro-MPI(which is implemented on top of OpenPiton, world's first open source, general purpose, multithreaded manycore processor with 64-bit Ariane RISC-V core) work with the latest Verilator v5.x versions. The original framework relied on Verilator v4.x, but with newer versions like v5.038 available, upgrading was essential for long-term maintainability and compatibility.

This upgrade introduced several challenges due to major internal changes in Verilator between v4.x and v5.x:

  * Common Issues in All Versions of Verilator v5.x :
    
    * **Precompiled Headers (pch)**: v5.x uses precompiled headers, whereas v4.x doesn’t. So, during the build, in order to prevent calling the pch files, I modified the `verilator/include/verilated.mk` (added the `-c` flag) to just compile. Later during the build, when pch is being called, it will already be compiled.
    * **Missing Headers**: There were a few functions that were undeclared and were used in my metro chipset.cpp, like init jbus model call. The most probable reason could be that v4.x is very permissive and would let a file refer to a function declared somewhere else even if the header was missing, whereas v5.x is not. It got fixed by just declaring the functions in the file from which they were being called.
    * **v5.x Initialization Sequence**: v4.x was consistent with SystemVerilog, i.e., initial blocks would run before the DPI calls into the simulation, but in v5.x, the scheduler was rewritten. DPI-C calls from the host side can be scheduled before the initial blocks in the design have executed. This means `b_open()` or similar setup code in an initial block might not have run yet when `write_64b_call()` or `read_64b_call()` is first called. It may try to access a memory address even before it is initialized, resulting in a segmentation fault.

      ```cpp
      /* ----------------------------------------------------------------
      * Guard against the new Verilator 5.x scheduler: the first call may
      * arrive before any initial block that used to call b_open().
      * ---------------------------------------------------------------- */
      if (sysMem == NULL) {
      // sysMem = b_create(); // returns a valid (but empty) root
      printf("[IOB] Lazy init_jbus_model_call at t=%llu\n",
      Verilated::time());
      init_jbus_model_call((char*)"mem.image", 0);
      }
      ```
      By doing this inside the `write_64b_call()` or `read_64b_call()` functions, we are initializing the root/memory if it is not initialized, with a 0 value.

  * Issues with Particular Versions:
    
    **Negative Values**: The issue of this error is most probably the fact that v5.x is more strict and has more standards-compliant error checking. In the design, any signal must not get any negative value at all, and if it may happen, then it’s better to have padding to clip it to 0.
    ```verilog
    // The value in the condition may be negative
    return_data_S2 = {{(‘L2_P1_DATA_BUF_IN_WIDTH - ‘L2_STATE_DATA_WIDTH){1’b0}},
                     state_data_trans_S2[‘L2_STATE_DATA]};
    ```
    ```verilog
    // Better way to implement the same logic
    localparam PAD_BITS = ‘L2_STATE_DATA_WIDTH >= ‘L2_P1_DATA_BUF_IN_WIDTH
                          ? 0
                          : ‘L2_P1_DATA_BUF_IN_WIDTH - ‘L2_STATE_DATA_WIDTH;
    return_data_S2 = {{(PAD_BITS){1’b0}}, state_data_trans_S2[‘L2_STATE_DATA]};
    ```

## Automatic Partitioning and Connectivity Analysis

The core of the Metro-MPI tool is its ability to automatically analyze a Verilog design to identify parallelizable sections and map their communication pathways. This process is handled by the `PartitionPortAnalyzer` and `HierCellsGraphVisitor` classes.

### Automatic Partition Detection

The tool does not require users to manually specify which modules to partition. It performs automatic detection by first building a complete hierarchical graph of the design using the `HierCellsGraphVisitor` class. It then traverses this graph and computes a Blake hash for each module's structural hierarchy. By searching for identical hashes, the tool can automatically and efficiently identify structurally identical, repeated module instances that are prime candidates for parallel simulation.

### Detailed Connectivity Analysis

Once partition instances are identified, the `PartitionPortAnalyzer` class conducts a deep analysis of the parent module's netlist to understand the data flow.
* It traces signals through chained `assign` statements using the `resolveWireChain` function to find the ultimate source wire for any given port connection.
* It applies a sophisticated filtering logic that intelligently prioritizes true `Output` ports as data originators over passive, passthrough `assign` statements, resulting in a cleaner data-flow graph.
* The analyzer is capable of finding the direction of ports on any instantiated module within the parent scope, whether it is a designated partition or not, by maintaining a map of instance names to their AST definitions (`m_instanceToModulePtr`).

### Global Uniqueness and Reporting

To ensure the generated code is robust, the analyzer performs several finalization steps.
* It conducts a global, link-aware name disambiguation phase at the end of the analysis. This process groups all signals by their communication link (e.g., all signals from rank 1 to rank 0) and renames any duplicate remote port names within that group to guarantee uniqueness.
* The final, fully analyzed connectivity graph is serialized into a `partition_report.json` file. This JSON file acts as the central, authoritative source of information for all subsequent code generation stages.

## Verilog Rewriting for MPI Integration

The tool automatically modifies the user's Verilog design to intercept signals for MPI communication, creating a new, parallel-ready version of the design without altering the original source files. This is orchestrated by the `MPIFileGenerator` class.

### DPI Stub Generation

For the module that has been chosen for partitioning, a generic "stub" module is generated. This stub module shares the exact same port list as the original module, but its internal logic is completely replaced by an `always @(*)` block containing a DPI (Direct Programming Interface) call to an external C++ function. This DPI call serves as the fundamental bridge between the Verilog simulation domain and the C++ MPI backend.

### Instance-Specific Wrappers

For each individual instance of the partitioned module (e.g., `tile0`, `tile1`), a unique Verilog wrapper module is created. Each wrapper instantiates the generic DPI stub and passes that instance's unique, pre-assigned MPI rank as a Verilog parameter (`PARTITION_ID`). This allows the C++ backend to identify which specific partition instance is making a DPI call.

### Parent Module Modification

The final step in the Verilog modification is to rewrite the parent module that instantiates the partitions. The tool reads the original parent module's source file and uses a regular expression (`std::regex`) to find and replace every instantiation of the original partitioned module with its corresponding new, instance-specific wrapper. This effectively re-wires the top-level design to use the MPI-enabled stubs.

## C++ Simulation and Harness Code Generation

A significant feature of the tool is the automated generation of all C++ code required to manage and execute the distributed MPI simulation.

### MPI Communication Layer

The `MPICodeGenerator` class is responsible for creating a low-level MPI communication layer from the `partition_report.json` file. It generates a file named `metro_mpi.cpp` which contains:
* Custom C++ `structs` tailored for each communication link (e.g., `struct mpi_rank_1_to_2_t`), ensuring type safety.
* Custom `MPI_Datatype`s created using `MPI_Type_create_struct`, which is the most efficient method for transferring structured data in MPI.
* A clean API of wrapper functions (e.g., `mpi_send_rank_1_to_2(...)`) that abstract away the underlying MPI calls.

### Partition Simulation Executable

The `MPIMainGenerator` class generates a complete, standalone C++ program (`<partition>_main.cpp`) that serves as the simulation driver for each non-zero MPI rank. This generated file:
* Initializes the MPI environment and the specific Verilated model for that partition (e.g., `Vtile`).
* Contains initialization functions to set constant-tied inputs for each specific partition instance.
* Implements the main simulation loop (`while (!sim_end)`), which coordinates the `send`, `receive`, and `top->eval()` cycle for its rank.

### Rank 0 Testbench Harness

To integrate with the main system simulation, the `Rank0MainGenerator` class generates code for the master process (Rank 0).
* It creates a C++ header file, `rank0_harness.h`, which contains the implementation of the DPI function that was imported into the Verilog stubs.
* This DPI function uses a `switch` statement based on the `partition_id` to translate the DPI call into the appropriate MPI send and receive calls to communicate with the correct partition process.
* The tool also generates a `README_integration.txt` file that provides clear, step-by-step instructions for users on how to include the harness and modify their existing testbench to work with the MPI co-simulation.

## Build System Generation

The tool automates the final step of the workflow: compiling the generated code into a runnable simulation.

### Makefile Generation

The `MakefileGenerator` class is responsible for creating a `Makefile.<partition>` for building the partition's simulation executable. This Makefile contains all the necessary rules for Verilating the partition's source files and compiling the generated C++ code.

### Configuration Preservation

The `MakefileGenerator` intelligently parses the original Verilator command line, which is passed to it as `argString`. It extracts relevant user-defined flags such as `-CFLAGS`, `-LDFLAGS`, `--trace`, and `-D` definitions, and includes them in the generated Makefile. This ensures that the user's original build configuration and options are preserved in the parallel simulation build.

### MPI Compiler Integration

Crucially, the generated `Makefile` is configured to use an MPI C++ compiler wrapper (e.g., `mpic++`) for the compilation and linking stages. This guarantees that the final executable is correctly linked against the necessary MPI libraries, enabling it to participate in the distributed simulation.