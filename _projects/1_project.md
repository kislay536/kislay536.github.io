---
layout: page
title: 'Metro-MPI: Accelerating Verilog Simulations'
description: A GSoC project to automatically partition and parallelize hardware simulations in Verilator using MPI.
img: assets/img/network_background.jpg
importance: 1
category: work
related_publications: false
---

The verification of large, complex System-on-Chip (SoC) designs is a significant bottleneck in the hardware development lifecycle. Cycle-accurate simulations, while precise, are notoriously slow, often taking days or even weeks to complete for realistic test scenarios. This project, completed as part of Google Summer of Code, introduces **Metro-MPI**, a powerful tool integrated into the Verilator ecosystem to tackle this challenge by automating the process of parallel simulation.

The core idea is to automatically partition a large hardware design into smaller, replicated modules and simulate each partition in parallel on a separate processor core using the Message Passing Interface (MPI). This can lead to a substantial reduction in overall simulation time, enabling more thorough verification in a shorter period.

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/metro_mpi_flowchart.png" title="Metro-MPI High-Level Flow" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/partition_graph.png" title="Partition Identification" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/generated_code.png" title="Automated Code Generation" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    From left to right: A high-level diagram of the Metro-MPI analysis and code generation flow; a visualization of a design hierarchy with identified partitions (e.g., CPU tiles); and an example of the automatically generated C++/MPI code for communication.
</div>

### The Metro-MPI Automated Workflow

Metro-MPI is triggered by a custom command-line flag, `--mmpi-o1`, passed to a modified Verilator executable. This initiates a sophisticated, multi-stage process to prepare the design for parallel simulation.

1.  **Hierarchy Analysis & Partition Identification:** The tool begins by creating an instance of `HierCellsGraphVisitor`, which traverses the entire design's Abstract Syntax Tree (AST). It builds a complete graph of the design hierarchy and computes a unique structural hash for each module instance. By searching for duplicate hashes, it can automatically identify replicated modules, which are ideal candidates for partitioning. For a complex design like OpenPiton, this process correctly identifies the RISC-V `tile` instances as the partitions.

2.  **Detailed Connectivity Analysis:** Once partitions are selected, the `PartitionPortAnalyzer` performs a deep analysis of every port on the partition boundary.
    * **Data Gathering:** A `PortGatherVisitor` collects detailed information for every connection on the parent module, including the port direction for all instances, not just the partitions.
    * **Driver/Load Classification:** The core of the analysis is a routine that correctly models the directed flow of data. For each partition port, it identifies whether it is an input or an output. If it's an input, it finds the single `output` port that drives it; if it's an output, it finds all the `input` ports that it drives (its loads). This crucial step correctly distinguishes true point-to-point data transfers from global signals like clocks and resets, preventing simulation errors.

3.  **Report and Code Generation:** The entire analysis is serialized to a `partition_report.json` file, which serves as the blueprint for code generation. Based on this report, a suite of generators creates a complete simulation environment:
    * **Modified Verilog:** New Verilog files are created, including wrappers that replace the original partitions and "stub" modules that use DPI-C calls to interface with the C++ backend.
    * **MPI Communication Layer:** A C++ file, `metro_mpi.cpp`, is generated, containing the MPI data structures, custom `MPI_Datatype`s, and send/receive functions tailored specifically to the design's communication patterns.
    * **Simulation Drivers:** Standalone C++ `main()` files are created for each partition, which handle instantiating the Verilated module, managing the simulation loop, and calling the MPI communication functions.
    * **System Harness:** A header file, `rank0_harness.h`, is generated for the main system simulation (MPI rank 0), providing the C++ implementation for the DPI-C functions called by the Verilog stubs.
    * **Build System:** Makefiles are generated to automate the compilation of each partition into a standalone, MPI-enabled executable.

4.  **Exit:** With the `--mmpi-o1 --d1` flags, the tool's job is purely analysis and generation. After creating all the necessary files, it prints a confirmation message and exits, without performing a full, monolithic Verilation. The generated files are then used in a separate step to compile and run the parallel simulation using an MPI launcher like `mpirun`.

### Case Study: Partitioning OpenPiton

To validate the tool, it was run on the OpenPiton manycore processor design. The top-level module is `chip`, which instantiates two `tile` modules, `tile0` and `tile1`.

<div class="row justify-content-sm-center">
    <div class="col-sm-8 mt-3 mt-md-0">
        {% include figure.liquid path="assets/img/json_report_snippet.png" title="Snippet of the generated partition_report.json" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm-4 mt-3 mt-md-0">
        {% include figure.liquid path="assets/img/openpiton_diagram.png" title="OpenPiton Tile Architecture" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    Left: A snippet from the `partition_report.json` file generated by Metro-MPI for the OpenPiton `chip` design, showing the detailed analysis for a port on `tile0`. Right: A conceptual diagram of the OpenPiton architecture with its replicated tiles.
</div>

The tool successfully identified `tile0` and `tile1` as partitions and generated a detailed report of their connectivity. For example, it correctly identified the point-to-point NoC (Network-on-Chip) link between the two tiles:

* The output `dyn0_dEo` of `tile0` is the driver for the input `dyn0_dataIn_W` of `tile1`.

The generated JSON report captures this relationship precisely, allowing the code generators to create the necessary MPI link between rank 1 (simulating `tile0`) and rank 2 (simulating `tile1`). Below is an example of the JSON output for a single port.

{% raw %}
```json
{
  "port_name": "dyn0_dEo",
  "direction": "out",
  "width": 64,
  "active": "Yes",
  "type": "wire",
  "connecting_wire": "tile_0_0_out_E_noc1_data",
  "mpi_process": "tile0",
  "mpi_rank": 1,
  "Comm": "P2P",
  "with_whom_is_it_communicating": [
    {
      "instance": "tile1",
      "port": "dyn0_dataIn_W",
      "mpi_process": "tile1",
      "mpi_rank": 2
    }
  ]
}