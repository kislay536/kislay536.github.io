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
<div class="caption">
    Metro-MPI++
</div>

## Project Description

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

### Metro-MPI Automated Workflow

Metro-MPI is triggered by a custom command-line flag, `--mmpi-o1`, passed to a modified Verilator executable. It performs a multi-stage process:

1. **Hierarchy Analysis & Partition Identification**  
   * Traverses the entire design AST using `HierCellsGraphVisitor`.  
   * Computes structural hashes for each module instance to detect replicated modules automatically.  
   * Identifies RISC-V `tile` instances in OpenPiton as ideal partitions.

2. **Detailed Connectivity Analysis**  
   * `PartitionPortAnalyzer` inspects all partition ports.  
   * `PortGatherVisitor` gathers port direction and connection details.  
   * Correctly models dataflow:  
      - Inputs → driven by exactly one output.  
      - Outputs → driving one or more inputs.  
   * Filters global signals like clock/reset.

3. **Report & Code Generation**  
   * Outputs `partition_report.json` with connectivity details.  
   * Generates:  
     - Modified Verilog with partition stubs.  
     - MPI C++ communication code.  
     - Partition-specific simulation drivers.  
     - `rank0_harness.h` for system-level harness.  
     - Makefiles for building MPI executables.

4. **Exit Stage**  
   * Analysis-only mode with `--mmpi-o1 --d1` generates files without full Verilation.  
   * Parallel simulation runs later using `mpirun`.

<div class="row justify-content-sm-center">
    <div class="col-sm-8 mt-3 mt-md-0">
        {% include figure.liquid path="assets/img/1.jpg" title="Generated partition_report.json snippet" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm-4 mt-3 mt-md-0">
        {% include figure.liquid path="assets/img/1.jpg" title="OpenPiton Tile Architecture" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    Left: Snippet from the generated `partition_report.json`. Right: OpenPiton architecture showing replicated tiles.
</div>

### Case Study: Partitioning OpenPiton

On OpenPiton, Metro-MPI correctly identified two `tile` instances (`tile0`, `tile1`) as partitions.  

For example, the point-to-point NoC link between them was captured precisely:  

* Output `dyn0_dEo` of `tile0` → Input `dyn0_dataIn_W` of `tile1`.

This relationship was encoded in JSON for MPI link generation:

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
