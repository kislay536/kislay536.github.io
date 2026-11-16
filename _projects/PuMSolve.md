---
layout: page
title: 'PuMSolve: Solver-Aided Discovery of DRAM-Resident Compute Kernels'
description: A Z3-based framework that synthesizes in-DRAM programs for a target operation, or proves that none exists.
img: assets/img/pumsolve-overview.png
importance: 1
category: fun
related_publications: false
---

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid loading="eager" path="assets/img/pumsolve-overview.png" title="PuMSolve overview" class="img-fluid rounded z-depth-1" %}
    </div>
</div>

<div class="caption">
    One Z3 query, two engines. Bounded model checking and an inductive invariant finder run on a shared solver core, and the first conclusive verdict wins.
</div>

**Try it live:** [hello-pum.streamlit.app](https://hello-pum.streamlit.app/) (both engines, live Z3 solving)

# Project Description

Processing-using-DRAM (PuM) techniques such as RowClone, Ambit, ComputeDRAM and SIMDRAM perform bulk copy, bitwise logic and bit-serial arithmetic inside memory. They are usually presented as hand-designed, hand-argued command sequences over a primitive set chosen in advance. Turning a *new* operation into a correct DRAM-resident program is still largely manual, and if a design is assumed to be infeasible, there is rarely a way to know why.

PuMSolve asks the complementary question: given a DRAM timing model and a declared set of physical mechanisms, can a solver **synthesize** a correct DRAM-resident program for a target operation, **prove** that none exists and explain why, and determine the **minimal set of mechanisms** the target actually requires?

# How It Works

PuMSolve treats a DRAM architecture as equations and constraints that must hold simultaneously. It keeps two concerns separate:

* **Protocol and timing legality**, extracted from Ramulator-style specifications.
* **Physical mechanisms** that produce data effects, each tracked with its provenance and validation status.

Whether a target functionality is realizable is posed as a single Z3 query: *there exist commands, operands, rows and times, such that for all data, the trace is legal and the target mechanism holds.* A satisfying assignment is not just a yes. It is a decomposition of the target into primitive DRAM operations, and every witness is replayed independently to confirm it is legal.

Two engines run on the same query:

* **Bounded model checking** searches for a witness at increasing program lengths.
* **An inductive invariant finder** looks for a structural property that proves no program of *any* length can succeed. For example, if every enabled mechanism is monotone, every composition of them is monotone, so a non-monotone target such as XOR is provably unreachable rather than merely unfound.

The same machinery drives minimal-mechanism-set discovery, which turns "is this buildable?" into "buildable if and only if mechanism set M is present". That pinpoints exactly which physical capability blocks a design.

The reasoning does not have to start from a given logic vocabulary. A separate physics-level model only describes per-cell charge contribution and sense-amplifier threshold behaviour. No MAJ, AND, OR or NOT primitive is declared, and Boolean functions emerge as proven consequences of that physics.

<div class="row mt-3">
    <div class="col-sm-8 mt-3 mt-md-0 mx-auto">
        {% include figure.liquid loading="eager" path="assets/img/pumsolve-bmc-vs-invariant.png" class="img-fluid rounded z-depth-1" %}
    </div>
</div>

<div class="caption">
    Same search graph, two strategies. Bounded model checking tries one bound at a time and never proves impossibility, while the invariant finder uses a few nodes to rule out the target at every stage at once.
</div>

# Results

All results come from executable self-checks in the prototype.

* **RowClone-style copy** is UNSAT under legal DDR4 timing, and stays UNSAT even with the copy mechanism enabled if timing is strict. With a shared sense amplifier and relaxed timing, the solver finds the minimal `ACT(src) → PRE → ACT(dst)` sequence.
* **Ambit's AND and OR** are rediscovered from triple-row activation alone, as `AND = MAJ(A,B,0)` and `OR = MAJ(A,B,1)`.
* **XOR is provably unreachable** with only majority and copy, but becomes synthesizable once dual-contact NOT is added. The monotone-only model reaches exactly 20 three-input functions, matching the Dedekind number for monotone functions, while the full mechanism set reaches all 256.
* **100 Boolean kernels** were evaluated, and all 100 agree with the theorem "solvable without NOT if and only if monotone".
* **A full adder** is synthesized and ripple composition is verified up to 32 bits, since monolithic synthesis alone does not scale.
* **RowHammer-style disturbance** is found as a 5-step witness that hammers an aggressor row three times per refresh window, using the coupling mechanism.

These are model-level results rather than hardware validation. Future work targets cost models and circuit or FPGA calibration of a synthesized witness.
