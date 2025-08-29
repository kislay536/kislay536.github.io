---
layout: page
title: 'Metro-MPI: Accelerating Verilog Simulations'
description: A GSoC project to automatically partition and parallelize hardware simulations in Verilator using MPI.
img: assets/img/network_background.jpg
importance: 1
category: work
related_publications: false
---

The verification of large, complex System-on-Chip (SoC) designs is a significant bottleneck in the hardware development lifecycle. Cycle-accurate simulations, while precise, are notoriously slow, often taking days or even weeks to complete for realistic test scenarios. This project, completed as part of **Google Summer of Code**, introduces **Metro-MPI**, a powerful tool integrated into the Verilator ecosystem to tackle this challenge by automating the process of parallel simulation.

The core idea is to automatically partition a large hardware design into smaller, replicated modules and simulate each partition in parallel on a separate processor core using the **Message Passing Interface (MPI)**. This can lead to a substantial reduction in overall simulation time, enabling more thorough verification in a shorter period.

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/mmpi-logo.png" title="Metro-MPI++" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/mmpi-raw-hierarchy.png" title="Raw Hierarchy Constructed" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/mmpi-hashed-hierarchy.png" title="Hashed Hierarchy" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/mmpi-weighted-hierarchhy.png" title="Weighted Hierarchy" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/mmpi-connections.png" title="Connections in OpenPiton 2x1 configuration" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="caption">
    From left to right: Metro-MPI workflow overview, partition graph for replicated modules, and generated MPI communication code.
</div>

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
