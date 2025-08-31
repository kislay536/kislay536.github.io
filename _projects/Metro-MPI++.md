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

The core of the Metro-MPI++ tool is its ability to automatically analyze a Verilog design to identify parallelizable sections and map their communication pathways. When Verilator is done constructing the Abstract Syntax Tree(AST), we are executing the `metro_mpi()` which is basically a function which is executing Metro-MPI++ using the constructed AST. The `metro_mpi()` function executes everything in stages, first entering the `V3Metro_MPI.h`  

### Automatic Partition Detection

The first and most critical step is to identify which parts of the hardware design are suitable for being partitioned and simulated in parallel. The framework employs a heuristic-based approach that identifies structurally identical, repeated module instances within the design hierarchy. This process is managed by the `HierCellsGraphVisitor` class.

The detection algorithm operates as follows:

  * **Hierarchical Graph Construction**: The [visitor](https://en.wikipedia.org/wiki/Visitor_pattern) traverses the entire design Abstract Syntax Tree (AST), starting from the top-level module. It constructs a directed graph representing the module instantiation hierarchy. Each node in this graph corresponds to a module instance, and edges represent the parent-child relationship between instances. Key metadata is stored for each node, including its instance name, module name, and full hierarchical path. This graph acts as the foundation of further analysis and everything further depends on it.

  <div class="row mt-3">
      <div class="col-sm mt-3 mt-md-0">
          {% include figure.liquid loading="eager" path="assets/img/mmpi-raw-hierarchy.png" class="img-fluid rounded z-depth-1" %}
      </div>
  </div>
  <div class="caption">
      The DAG representing the  hierarchy of OpenPiton 2x2 configuration. 
  </div>

  * **Structural Hashing**: To identify structurally identical sub-hierarchies, a unique hash is generated for each node. This hash is not based on the instance name (e.g., \$root.core_0), but on the hierarchical path of module types (e.g., \$root.Top.Core). The system uses the [blake2b](https://en.wikipedia.org/wiki/BLAKE_(hash_function)#BLAKE2) algorithm for this purpose. This ensures that two instances, core_0 and core_1, both of type Core under a Top module, will produce the same hash, even though their instance paths are different. To add these hashes, we first do a DFS traversal and once we reached the lead node, basically a leaf module in AST, we calculated the hash of its module name(not instance name) and we do the same for all nodes in the same level, we got a 128 bit long hash for each name as `blake2b` takes variable size of input and produces hash of same length. Then as in DFS we go to the parent node, we computed the hash of parent module by operating the hash function on `<parent_module>.<child0_hash>.<child1_hash>.....<last_child_hash>` and this again gives hash of same length. So, by choosing `blake2b` we get a consistent hash for all nodes and by this way we are ensuring that if any two node has the same hash, then with 100% certainity we can say that the hierarchy below those nodes are exactly the same. Or, they represent a duplicate hardware block.

  <div class="row mt-3">
      <div class="col-sm mt-3 mt-md-0">
          {% include figure.liquid loading="eager" path="assets/img/mmpi-hashed-hierarchy.png" class="img-fluid rounded z-depth-1" %}
      </div>
  </div>
  <div class="caption">
      This is the hashed version of the raw Hierarchy Graph. The nodes with same colour represents that they have the same hash and visually it is evident that the underlying hierarchy is also the same for those nodes. 
  </div>

  * **Complexity Weighting or the Weight Model**: After assigining the hashes, it became easy to find the duplicate hierarchies but it didn't tell anything about the size of those hierarchies so we used a weight model which will basically assign weights to the nodes from which we can estimate the size of underlying hierarchy. The current weight model is simple and will work for any Hardware design which has a design similar to a manycore CPU but may not work for other types of design. And in those, case one just need to modify the weight model.  

  <div class="row mt-3">
      <div class="col-sm mt-3 mt-md-0">
          {% include figure.liquid loading="eager" path="assets/img/mmpi-weighted-hierarchy.png" class="img-fluid rounded z-depth-1" %}
      </div>
  </div>
  <div class="caption">
      This is the hashed and weighted version of the raw Hierarchy Graph. The nodes with same colour represents that they have the same hash  and weight. 
  </div>

  * **Partition Selection (BFS)**: With the graph built and weighted, a Breadth-First Search (BFS) is used to traverse the hierarchy level by level. At each level, the algorithm groups instances by their structural hash.

      - If a hash appears more than once at a given level, it signifies the discovery of multiple, structurally identical instances that are candidates for partitioning.

      - To select the best candidate set, the algorithm chooses the group of instances with the highest cumulative weight. This heuristic prioritizes partitioning the most complex or significant repeating structures in the design.

Once this "best" group is identified, the algorithm designates their common module type as the partition module and outputs the list of instance names to be analyzed further.

  <div class="row mt-3">
      <div class="col-sm mt-3 mt-md-0">
          {% include figure.liquid loading="eager" path="assets/img/mmpi-partition-result.png" class="img-fluid rounded z-depth-1" %}
      </div>
  </div>
  <div class="caption">
      Output when partition analysis was carried out on OpenPiton 2x2 configuration.
  </div>

### Detailed Connectivity Analysis

Once partition instances are identified, the `PartitionPortAnalyzer` class conducts a deep analysis of the parent module's netlist to understand the data flow. The reason why this step in important is because until we don't know which port of which module instance is connected to which peer, we woun't be able to make the MPI structures that will be used to carry the information across multiple processes/MPI ranks. 
  <div class="row mt-3">
      <div class="col-sm mt-3 mt-md-0">
          {% include figure.liquid loading="eager" path="assets/img/mmpi-connections.png" class="img-fluid rounded z-depth-1" %}
      </div>
  </div>
  <div class="caption">
      Representation of chip module of OpenPiton 2x1 configuration. 
  </div>
This analysis also serves as an optimization that helps to reduce the data movement between MPI ranks during runtime. For example, It is evident from the above image that the 2 tiles are connected via wires which are defined in the chip module and inherently, the data should flow from tile0 to chip to tile1 as wires are the part of chip  mmodule and vice versa but we don't need the messages to pass through the chip module in case the 2 instances are communicating with each other. So to avoid this, this analysis tries to recursively look into the connections of each port of each module instances and tries to classify which ports are expecting data from which other ports, which of them are initialisation(just one time data movement) and which are of type "logic" i.e. the port is being driven by some logic inside the parent module(here, it is chip module). More details of this analysis is mentioned below:

* It traces signals through chained `assign` statements using the `resolveWireChain` function to find the ultimate source wire for any given port connection.
* It applies a sophisticated filtering logic that intelligently prioritizes true `Output` ports as data originators over passive, passthrough `assign` statements, resulting in a cleaner data-flow graph.
* The analyzer is capable of finding the direction of ports on any instantiated module within the parent scope, whether it is a designated partition or not, by maintaining a map of instance names to their AST definitions (`m_instanceToModulePtr`).

### Global Uniqueness and Reporting

To ensure a functional and optimized parallel simulation, the framework must guarantee that every communicating process has a unique identifier and that the results of the connectivity analysis are captured in a clear, comprehensive, and usable format.

#### Global Uniqueness: Deterministic MPI Rank Assignment

A fundamental requirement for any MPI-based application is that each parallel process must have a unique integer identifier, known as its rank. The `PartitionPortAnalyzer` class establishes a globally unique and consistent ranking system before the main analysis begins.

The assignment process is as follows:

* System Rank: A special conceptual process named "system" is always assigned rank 0. This rank represents all non-partitioned logic, the top-level testbench, and any I/O external to the partitioned instances.

* Deterministic Sorting: To ensure that the analysis is repeatable and stable, the list of discovered partition instance names is sorted alphabetically. This critical step prevents rank assignments from changing between different runs of the tool, which is essential for consistent builds.

* Sequential Assignment: After sorting, the framework iterates through the list of partition instances and assigns them sequential, incremental ranks starting from 1 (e.g., 1, 2, 3, ...).

* Centralized Mapping: These assignments are stored in a map (`m_mpiRankMap`), which serves as the single source of truth for retrieving the rank of any partition instance or the system process during the analysis. The final rank for each port and its communication partners is stored directly within the Port and CommunicationPartner data structures.

The reason why we are introducing MPI ranks here even if the ranks are a runtime assignment/property is because by doing this we can correlate any identifier of the partitions with the rank as we can control the rank assignment and more importantly, it makes the generation of MPI strucutres and MPI send & recieve function very straight forward.  

#### **Reporting for Analysis and Automation**

The framework generates two distinct reports from the analysis data, one tailored for human review and the other for machine consumption by downstream automation tools.

*  **Human-Readable Console Report (`printReport`)**
    * This function prints a formatted table directly to the console for immediate user feedback and debugging.
    * The report is organized by partition instance and lists every port.
    * Key columns include the port's name, direction, width, its own assigned MPI rank and process name, and the classified communication type (`P2P`, `broadcast`, or `NULL`).
    * Crucially, it provides formatted lists of remote partners, showing the specific instances, ports, MPI processes, and MPI ranks it communicates with, making the connectivity explicit and easy to verify.

```txt
Instance: tile0
-------------------------------------------
Port Name                 Direction  Width   Own Rank   Own MPI Process Comm Type    Remote Instance           Remote Port               Remote MPI Process   Remote MPI Rank
clk                       in         1       1          tile0      P2P          [clock_mux]               [clk_muxed]               [system]             [0]
rst_n                     in         1       1          tile0      P2P          [rst_sync]                [syncdata]                [system]             [0]
clk_en                    in         1       1          tile0      NULL         []                        []                        []                   []
default_chipid            in         14      1          tile0      NULL         []                        []                        []                   []
default_coreid_x          in         8       1          tile0      NULL         []                        []                        []                   []
default_coreid_y          in         8       1          tile0      NULL         []                        []                        []                   []
default_total_num_tiles   in         32      1          tile0      NULL         []                        []                        []                   []
flat_tileid               in         8       1          tile0      NULL         []                        []                        []                   []
debug_req_i               in         1       1          tile0      NULL         []                        []                        []                   []
unavailable_o             out        1       1          tile0      P2P          [chip]                    [logic_unavailable_o]     [system]             [0]
timer_irq_i               in         1       1          tile0      NULL         []                        []                        []                   []
ipi_i                     in         1       1          tile0      NULL         []                        []                        []                   []
irq_i                     in         2       1          tile0      NULL         []                        []                        []                   []
tile_jtag_ucb_val         out        1       1          tile0      NULL         []                        []                        []                   []
tile_jtag_ucb_data        out        4       1          tile0      NULL         []                        []                        []                   []
jtag_tiles_ucb_val        in         1       1          tile0      P2P          [jtag_port]               [jtag_tiles_ucb_val]      [system]             [0]
jtag_tiles_ucb_data       in         4       1          tile0      P2P          [jtag_port]               [jtag_tiles_ucb_data]     [system]             [0]
dyn0_dataIn_N             in         64      1          tile0      NULL         []                        []                        []                   []
dyn0_dataIn_E             in         64      1          tile0      P2P          [tile1]                   [dyn0_dWo]                [tile1]              [2]
dyn0_dataIn_W             in         64      1          tile0      P2P          [chip_from_intf_noc1_v2c] [data_out_dyn0_dataIn_W]  [system]             [0]
dyn0_dataIn_S             in         64      1          tile0      P2P          [tile2]                   [dyn0_dNo]                [tile2]              [3]
dyn0_validIn_N            in         1       1          tile0      NULL         []                        []                        []                   []
dyn0_validIn_E            in         1       1          tile0      P2P          [tile1]                   [dyn0_dWo_valid]          [tile1]              [2]
dyn0_validIn_W            in         1       1          tile0      P2P          [chip_from_intf_noc1_v2c] [valid_out_dyn0_validIn_W] [system]             [0]
dyn0_validIn_S            in         1       1          tile0      P2P          [tile2]                   [dyn0_dNo_valid]          [tile2]              [3]
dyn0_dNo_yummy            in         1       1          tile0      NULL         []                        []                        []                   []
dyn0_dEo_yummy            in         1       1          tile0      P2P          [tile1]                   [dyn0_yummyOut_W]         [tile1]              [2]
dyn0_dWo_yummy            in         1       1          tile0      P2P          [chip_to_intf_noc1_c2v]   [yummy_in_dyn0_dWo_yummy] [system]             [0]
dyn0_dSo_yummy            in         1       1          tile0      P2P          [tile2]                   [dyn0_yummyOut_N]         [tile2]              [3]
dyn0_dNo                  out        64      1          tile0      NULL         []                        []                        []                   []
dyn0_dEo                  out        64      1          tile0      P2P          [tile1]                   [dyn0_dataIn_W]           [tile1]              [2]
dyn0_dWo                  out        64      1          tile0      P2P          [chip]                    [logic_dyn0_dWo]          [system]             [0]
dyn0_dSo                  out        64      1          tile0      P2P          [tile2]                   [dyn0_dataIn_N]           [tile2]              [3]
dyn0_dNo_valid            out        1       1          tile0      NULL         []                        []                        []                   []
dyn0_dEo_valid            out        1       1          tile0      P2P          [tile1]                   [dyn0_validIn_W]          [tile1]              [2]
dyn0_dWo_valid            out        1       1          tile0      P2P          [chip]                    [logic_dyn0_dWo_valid]    [system]             [0]
dyn0_dSo_valid            out        1       1          tile0      P2P          [tile2]                   [dyn0_validIn_N]          [tile2]              [3]
dyn0_yummyOut_N           out        1       1          tile0      NULL         []                        []                        []                   []
dyn0_yummyOut_E           out        1       1          tile0      P2P          [tile1]                   [dyn0_dWo_yummy]          [tile1]              [2]
dyn0_yummyOut_W           out        1       1          tile0      P2P          [chip]                    [logic_dyn0_yummyOut_W]   [system]             [0]
dyn0_yummyOut_S           out        1       1          tile0      P2P          [tile2]                   [dyn0_dNo_yummy]          [tile2]              [3]
dyn1_dataIn_N             in         64      1          tile0      NULL         []                        []                        []                   []
dyn1_dataIn_E             in         64      1          tile0      P2P          [tile1]                   [dyn1_dWo]                [tile1]              [2]
dyn1_dataIn_W             in         64      1          tile0      P2P          [chip_from_intf_noc2_v2c] [data_out_dyn1_dataIn_W]  [system]             [0]
dyn1_dataIn_S             in         64      1          tile0      P2P          [tile2]                   [dyn1_dNo]                [tile2]              [3]
dyn1_validIn_N            in         1       1          tile0      NULL         []                        []                        []                   []
dyn1_validIn_E            in         1       1          tile0      P2P          [tile1]                   [dyn1_dWo_valid]          [tile1]              [2]
dyn1_validIn_W            in         1       1          tile0      P2P          [chip_from_intf_noc2_v2c] [valid_out_dyn1_validIn_W] [system]             [0]
dyn1_validIn_S            in         1       1          tile0      P2P          [tile2]                   [dyn1_dNo_valid]          [tile2]              [3]
dyn1_dNo_yummy            in         1       1          tile0      NULL         []                        []                        []                   []
dyn1_dEo_yummy            in         1       1          tile0      P2P          [tile1]                   [dyn1_yummyOut_W]         [tile1]              [2]
dyn1_dWo_yummy            in         1       1          tile0      NULL         []                        []                        []                   []
dyn1_dSo_yummy            in         1       1          tile0      P2P          [tile2]                   [dyn1_yummyOut_N]         [tile2]              [3]
dyn1_dNo                  out        64      1          tile0      NULL         []                        []                        []                   []
dyn1_dEo                  out        64      1          tile0      P2P          [tile1]                   [dyn1_dataIn_W]           [tile1]              [2]
dyn1_dWo                  out        64      1          tile0      P2P          [chip]                    [logic_dyn1_dWo]          [system]             [0]
dyn1_dSo                  out        64      1          tile0      P2P          [tile2]                   [dyn1_dataIn_N]           [tile2]              [3]
dyn1_dNo_valid            out        1       1          tile0      NULL         []                        []                        []                   []
dyn1_dEo_valid            out        1       1          tile0      P2P          [tile1]                   [dyn1_validIn_W]          [tile1]              [2]
dyn1_dWo_valid            out        1       1          tile0      P2P          [chip]                    [logic_dyn1_dWo_valid]    [system]             [0]
dyn1_dSo_valid            out        1       1          tile0      P2P          [tile2]                   [dyn1_validIn_N]          [tile2]              [3]
dyn1_yummyOut_N           out        1       1          tile0      NULL         []                        []                        []                   []
dyn1_yummyOut_E           out        1       1          tile0      P2P          [tile1]                   [dyn1_dWo_yummy]          [tile1]              [2]
dyn1_yummyOut_W           out        1       1          tile0      P2P          [chip]                    [logic_dyn1_yummyOut_W]   [system]             [0]
dyn1_yummyOut_S           out        1       1          tile0      P2P          [tile2]                   [dyn1_dNo_yummy]          [tile2]              [3]
dyn2_dataIn_N             in         64      1          tile0      NULL         []                        []                        []                   []
dyn2_dataIn_E             in         64      1          tile0      P2P          [tile1]                   [dyn2_dWo]                [tile1]              [2]
dyn2_dataIn_W             in         64      1          tile0      NULL         []                        []                        []                   []
dyn2_dataIn_S             in         64      1          tile0      P2P          [tile2]                   [dyn2_dNo]                [tile2]              [3]
dyn2_validIn_N            in         1       1          tile0      NULL         []                        []                        []                   []
dyn2_validIn_E            in         1       1          tile0      P2P          [tile1]                   [dyn2_dWo_valid]          [tile1]              [2]
dyn2_validIn_W            in         1       1          tile0      NULL         []                        []                        []                   []
dyn2_validIn_S            in         1       1          tile0      P2P          [tile2]                   [dyn2_dNo_valid]          [tile2]              [3]
dyn2_dNo_yummy            in         1       1          tile0      NULL         []                        []                        []                   []
dyn2_dEo_yummy            in         1       1          tile0      P2P          [tile1]                   [dyn2_yummyOut_W]         [tile1]              [2]
dyn2_dWo_yummy            in         1       1          tile0      P2P          [chip_to_intf_noc3_c2v]   [yummy_in_dyn2_dWo_yummy] [system]             [0]
dyn2_dSo_yummy            in         1       1          tile0      P2P          [tile2]                   [dyn2_yummyOut_N]         [tile2]              [3]
dyn2_dNo                  out        64      1          tile0      NULL         []                        []                        []                   []
dyn2_dEo                  out        64      1          tile0      P2P          [tile1]                   [dyn2_dataIn_W]           [tile1]              [2]
dyn2_dWo                  out        64      1          tile0      P2P          [chip]                    [logic_dyn2_dWo]          [system]             [0]
dyn2_dSo                  out        64      1          tile0      P2P          [tile2]                   [dyn2_dataIn_N]           [tile2]              [3]
dyn2_dNo_valid            out        1       1          tile0      NULL         []                        []                        []                   []
dyn2_dEo_valid            out        1       1          tile0      P2P          [tile1]                   [dyn2_validIn_W]          [tile1]              [2]
dyn2_dWo_valid            out        1       1          tile0      P2P          [chip]                    [logic_dyn2_dWo_valid]    [system]             [0]
dyn2_dSo_valid            out        1       1          tile0      P2P          [tile2]                   [dyn2_validIn_N]          [tile2]              [3]
dyn2_yummyOut_N           out        1       1          tile0      NULL         []                        []                        []                   []
dyn2_yummyOut_E           out        1       1          tile0      P2P          [tile1]                   [dyn2_dWo_yummy]          [tile1]              [2]
dyn2_yummyOut_W           out        1       1          tile0      P2P          [chip]                    [logic_dyn2_yummyOut_W]   [system]             [0]
dyn2_yummyOut_S           out        1       1          tile0      P2P          [tile2]                   [dyn2_dNo_yummy]          [tile2]              [3]
```

*  **Machine-Readable JSON Report (`writeJsonReport`)**
    * This function is the primary output for the entire analysis pipeline, serializing the results into a structured JSON file named `metro_mpi/partition_report.json`.
    * This file serves as a standardized data interchange format for subsequent code generation steps, such as creating MPI wrappers, C++ drivers, and Makefiles.
    * The JSON structure is hierarchical, with a top-level `partitions` object containing entries for each analyzed instance. Each instance contains a detailed array of its ports.
    * Each port object in the JSON is comprehensive, containing fields for:
        * Basic properties: `port_name`, `direction`, `width`.
        * Connection details: `active`, `type`, `connecting_wire`.
        * MPI Identity: Its own `mpi_process` and `mpi_rank`.
        * Communication Profile: The `Comm` field, indicating the communication type (`P2P`, `broadcast`, etc.).
        * Partner List: A `with_whom_is_it_communicating` array, which contains a list of objects, each detailing a remote partner's `instance`, `port`, `mpi_process`, and `mpi_rank`.

    ```json
    {
      "partitions": {
        "tile0": [
          {
            "port_name": "clk",
            "direction": "in",
            "width": 1,
            "active": "Yes",
            "type": "wire",
            "connecting_wire": "clk_muxed",
            "mpi_process": "tile0",
            "mpi_rank": 1,
            "Comm": "P2P",
            "with_whom_is_it_communicating": [{"instance": "clock_mux", "port": "clk_muxed", "mpi_process": "system", "mpi_rank": 0}]
          },
          ....

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
            "with_whom_is_it_communicating": [{"instance": "tile1", "port": "dyn0_dataIn_W", "mpi_process": "tile1", "mpi_rank": 2}]
          },
          ....],
        "tile1": [.....]
      }
    }
    ```

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

