<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="src/assets/brand/pmks-logo-dark.png">
  <img alt="PMKS" src="src/assets/brand/pmks-logo.png" width="300">
</picture>

### Serious linkage analysis. Zero setup.

**PMKS** *(Planar Mechanism Kinematic Simulator, formerly PMKS+)* is a free, open-source linkage
simulator for mechanical engineering education. Build four-bars, slider-cranks, six-bars, and
multi-loop mechanisms in your browser, and plot positions, velocities, accelerations, and
forces—with nothing to install, no account required, and nothing stored on a server.

[**Open PMKS**](https://app.pmksplus.com) &nbsp;·&nbsp; [**Website & Guides**](https://pmksplus.com) &nbsp;·&nbsp; [Mechanism Library](#mechanism-library) &nbsp;·&nbsp; [Verification](#verification) &nbsp;·&nbsp; [Contributing](#contributing)

[![License MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE) ![Angular 22](https://img.shields.io/badge/Angular-22-dd0031) ![Node 22.22.3+](https://img.shields.io/badge/Node-22.22.3%20%C2%B7%2024.15%2B-5fa04e) ![No account needed](https://img.shields.io/badge/account-not%20required-brightgreen) [![Verified against Exudyn and MATLAB](https://img.shields.io/badge/solvers-verified%20against%20Exudyn%20%26%20MATLAB-8a2be2)](https://pmksplus.com/validation)

</div>

<img alt="PMKS in Kinematic Analysis: a Jansen leg tracing its paths, with the position graph for joint F in the left panel" src="docs/images/readme/hero-framed.png" />


---

## Contents

**Using PMKS**

- [Overview](#overview)
- [Interface](#interface)
- [Building Mechanisms](#building-mechanisms)
- [Kinematic and Force Analysis](#kinematic-and-force-analysis)
- [Readiness Checks](#readiness-checks)
- [Multiple Mechanisms in One Drawing](#multiple-mechanisms-in-one-drawing)
- [Synthesis](#synthesis)
- [Exporting Data and Drawings](#exporting-data-and-drawings)
- [Saving and Sharing via URL](#saving-and-sharing-via-url)
- [Mechanism Library](#mechanism-library)
- [Units, Settings, and Keyboard Shortcuts](#units-settings-and-keyboard-shortcuts)

**Developing PMKS**

- [Before Your First Change](#before-your-first-change)
- [Verification](#verification)
- [Design Principles](#design-principles)
- [Architecture](#architecture)
- [Development](#development)
- [Contributing](#contributing)
- [License and Contact](#license-and-contact)
- [Supporting PMKS](#supporting-pmks)
- [Acknowledgements](#acknowledgements)

---

## Overview

PMKS is a browser-based simulator for planar linkages, built for kinematics and machine-dynamics
coursework. Sketch links on a grid, ground the frame joints, assign a driven input, and inspect the
resulting motion, coupler curves, and reaction forces directly in the browser.

Everything runs client-side with no login or backend storage. Every mechanism encodes into a single
URL, so sharing a problem setup or homework linkage is just copying and pasting a link.

This version of PMKS (formerly **PMKS+**) succeeds the **original PMKS**, created by Prof.
Matthew I. Campbell at Oregon State University, and is developed at **Worcester Polytechnic
Institute** by undergraduate and graduate project teams.

| | |
| --- | --- |
| **App** | [app.pmksplus.com](https://app.pmksplus.com) (or [open the library directly](https://app.pmksplus.com/?library)) |
| **Website & guides** | [pmksplus.com](https://pmksplus.com) — overview, [interactive calculators & mechanism guides](https://pmksplus.com/guides), and [solver validation](https://pmksplus.com/validation) |
| **UI gallery** | [docs.pmksplus.com](https://docs.pmksplus.com) — Storybook component gallery and UI style guide |
| **Built for** | Kinematics and machine-dynamics coursework: four-bars, slider-cranks, six-bars, quick-returns, and multi-loop linkages |
| **Solves** | Position · velocity · acceleration · static and dynamic joint reactions · required input torque or force |
| **License & cost** | Free and open source under MIT; no sign-in required; runs in any modern browser |

---

## Interface

The full-screen SVG canvas sits underneath floating UI cards:

![The seven regions of the PMKS interface, labeled on a running four-bar](docs/images/readme/interface-map.png)

| | Region | Contents |
| :-: | --- | --- |
| **1** | **Top bar** | Project menu, the four **mode tabs** (analysis tabs show readiness chips once a mechanism is drawn), and a right-hand action card (Undo/Redo in Edit mode; **Export Data** in analysis modes) |
| **2** | **Mode panel** | Context panel for the active mode: Synthesis inputs, Edit properties for the selection, or analysis graphs (250px wide in Edit/Synthesis; 400px in analysis modes) |
| **3** | **Canvas** | Interactive grid with right-click context menus, dragging, pan, and zoom; auto-framing fits the linkage into the unobstructed viewport area |
| **4** | **Playback** | Transport controls (speed, play/pause, return to start pose) and timeline scrubber (analysis modes only) |
| **5** | **View controls** | Toggles for center of mass, joint and force names, and traced paths; actions for Zoom Out, Zoom In, Fit to View, and Fit Full Motion |
| **6** | **Status bar** | Active mode, readiness summary, cursor coordinates, and current units |
| **7** | **Right drawer** | Settings, Help & Feedback, analysis setup checklists, and Export Data (one open at a time) |

### Modes

| Mode | Shortcut | Purpose |
| --- | --- | --- |
| **Synthesis** | <kbd>1</kbd> | Generate four-bar and six-bar linkages from three target coupler poses |
| **Edit** | <kbd>2</kbd> | Build and modify mechanism geometry (available while paused at the start pose) |
| **Kinematic Analysis** | <kbd>3</kbd> | Plot position, velocity, and acceleration for joints, links, and centers of mass |
| **Force Analysis** | <kbd>4</kbd> | Plot per-link joint reactions and required input torque or force |

Geometry edits are disabled during analysis modes so graphs always match the solved cycle, while
non-geometric actions (adding tracer points or forces, dragging force anchors, toggling vectors and
traces) remain available.

On mobile screens, the mode panel collapses into a bottom sheet, the canvas supports standard pan
and pinch-zoom gestures, and a long press opens the context menu.

---

## Building Mechanisms

Right-click the grid to add new parts, or right-click an existing joint, link, or force to modify
or attach to it.

### Joint types

Each joint has one **Joint Type**, chosen in the Edit panel or at the top of the joint's
right-click menu:

| Type | What it does |
| --- | --- |
| **Revolute** | A pin. The bodies that meet at the joint turn about it |
| **Pin-in-slot** | A pin that rides a slot. It slides along the slot and turns in it |
| **Prismatic** | A block fixed to the body that rides it. It slides along its slot and does not turn |
| **Welded** | Fuses the links that meet at the joint into one rigid compound link |

**Grounded** is a separate switch beside the type. A slot can be grounded (fixed to the frame) or
floating (carried on a moving link). A Revolute, Pin-in-slot, or Prismatic joint can be the
**driven input**. A Welded joint cannot, because it allows no relative motion.

### Parts

| Part | Details |
| --- | --- |
| **Link** | Connects two or more joints with configurable length, mass, mass moment of inertia, center of mass, color, and name. Two-joint links can hold a **Fixed Length**, **Fixed Angle**, or both while connected parts are dragged |
| **Compound link** | Created by welding links together at shared joints so they move as a single rigid body (e.g., bell cranks, brackets, excavator buckets) |
| **Cylinder** | Menu-created hydraulic/linear actuator consisting of a barrel, a rod, and a sealed Prismatic joint between them. It can be driven directly as a linear input |
| **Slider** | Constrains a joint to move along a grounded or floating guide at any angle |
| **Tracer point** | A point rigidly attached to a link for plotting paths, velocities, and accelerations away from pins |
| **Force** | External load applied to a link in either the **Link** reference frame (rotates with the link) or the **Grid** reference frame (fixed to the grid) |
| **Lock** | Locks a joint or link against dragging—useful when sharing a linkage that should only be adjusted at specific points |
| **Background image** | Reference photo or drawing pinned behind the grid (scalable and rotatable) for tracing real machines; stays local to your browser and is never uploaded |

![The Edit panel open on a joint of a welded excavator bucket](docs/images/readme/edit-panel.png)

![An excavator bucket driven by a hydraulic cylinder, with the bucket's angular kinematics graphed](docs/images/readme/cylinders.png)

Driven cylinders act as linear inputs: the playback bar displays extension distance and reversal
state, the scrubber spans the active stroke used by the cycle (with a setup warning if only part of
the drawn stroke is reachable), and the drive speed is configured under **Input Speed** in your
selected length unit per second.

---

## Kinematic and Force Analysis

### Kinematic analysis

![Kinematic analysis of a Whitworth quick-return, with position and velocity graphed](docs/images/readme/kinematic-analysis.png)

Select a **joint** to plot its position, velocity, and acceleration. Select a **link** to plot its
angle, angular velocity, and angular acceleration, or switch to its **Center of Mass** tab for
linear kinematics of the CoM. Each graph header displays a live readout at the current pose as you
play or scrub.

Velocity, acceleration, and force vectors can also be displayed directly on the canvas during
playback.

### Force analysis

![Force analysis of a toggle clamp: reaction forces on both links at the clamped joint](docs/images/readme/force-analysis.png)

Force Analysis supports two modes:

- **Static (Equilibrium)**: solves quasi-static equilibrium at each pose, ignoring inertia.
- **In-motion (Dynamic)**: solves full Newton–Euler dynamics using each link's mass and mass moment
  of inertia.

Reactions are reported **per link at each joint**—the force on link *AB* and the force on link *BC*
are shown separately, matching their individual free-body diagrams—alongside the required **input
torque** (rotary drive) or **input force** (linear drive).

Gravity is enabled by default and can be toggled in Settings. Links with zero mass contribute no
weight or inertia.

### Input-based playback

The scrubber tracks the driven input's full range of motion rather than arbitrary elapsed time:

- A **cylinder or slider** spans from one end of its travel to the other.
- A **rocking crank** spans between its two angular limits.
- A **continuously rotating crank** spans a complete cycle (one revolution, or two when a link
  crosses an assembly branch at a slot tangency), starting at zero in the drawn start pose.

Playback advances in real time (at 1× speed, one revolution takes `60 / RPM` seconds regardless of
frame rate), with 2× and 4× speed options.

---

## Readiness Checks

![The Force Analysis setup drawer explaining that nothing loads the mechanism yet](docs/images/readme/readiness.png)

Once a mechanism is on the grid, each analysis tab displays a readiness badge (**`Ready`**, or a
count such as **`2 fixes`** for kinematics or **`1 to set`** for forces). Clicking a tab that isn't
ready opens its setup drawer, which groups items into:

- **Blockers**: issues that prevent the solver from running.
- **Warnings**: valid mechanisms with conditions worth checking before relying on the results.

Most items identify the specific joint or link and jump straight to it on click. The Force Analysis
setup drawer also includes a **Masses** table so you can edit every link's mass and inertia in one
place.

---

## Multiple Mechanisms in One Drawing

![Three independent mechanisms on one grid, with the scrub card split into a row each](docs/images/readme/multi-machine.png)

A single canvas can hold up to four independent mechanisms (`M1`–`M4`). PMKS automatically
partitions connected components, solving each with its own driven joint, speed, and direction. By
default they animate together under a single **`All`** scrubber row; toggling the view splits the
scrubber into independent rows per mechanism, each with its own handle, angle/position, and time
readout.

Because multiple mechanisms can coexist on one grid, input speed and direction belong to each
driven joint rather than global settings.

---

## Synthesis

![Motion synthesis: three coupler positions, a solved four-bar, and the Insert control](docs/images/readme/synthesis.png)

Specify three target positions and orientations for a coupler link, and PMKS generates up to eight
distinct four-bar candidates that pass through them. You can constrain the search by:

- **Reaching all 3 poses on one assembly branch** (no disassembly required between poses).
- **Coupler attachment points**: restrict pins to the coupler's endpoints, or allow attachment
  points along and beyond the link to explore additional ground-pivot layouts.
- **Ground pivot region**: draw a bounding region where ground joints must land.

Each candidate shows which poses it reaches, its assembly branch, which joint drives it, and a live
preview scrubber. When a four-bar's input only rocks through an arc, **Add Input Link (Six-Bar)**
attaches a continuously rotating driver dyad sized in closed form to sweep the exact arc. Clicking
**Insert into Grid** places the chosen linkage onto the canvas as a normal editable mechanism in a
single undo step.

---

## Exporting Data and Drawings

![The Export drawer, step one: choosing which parts to export](docs/images/readme/export.png)

In either analysis mode, **Export Data** walks through selecting parts, kinematic columns, force
columns, and file output options:

| Format | Output |
| --- | --- |
| **CSV** | One `.csv` per table, or a `.zip` archive when exporting more than two tables |
| **Excel** | A single `.xlsx` workbook with one sheet per table |
| **Images** | Individual PNG or SVG plots (bundled as a `.zip` when exporting more than two) |
| **Report** | A print-ready report containing the mechanism drawing, key properties, plots, data tables, and a share URL—ready to print or save as PDF |

Numeric precision can be set to 2, 4, or 6 decimal places, or full solver precision. From the
project menu, **CAD Export** also exports start-pose link geometry as **DXF** or **SVG**
(optionally paired with a parts CSV) for laser cutting or CAD import.

---

## Saving and Sharing via URL

| Project menu item | Action |
| --- | --- |
| **New Project** | Opens a blank grid in a new tab without closing your current work |
| **Open** | Loads a saved `.pmks` file from disk |
| **Templates** | Opens the mechanism library |
| **Save** | Downloads the current mechanism as a `.pmks` file |
| **Share Project** | Copies a URL that reopens the drawing and its document settings. Background images and device preferences are not included |

Undo and redo use the same URL encoding: each history entry is a serialized snapshot, so undoing
restores the entire drawing state (geometry, welds, locks, masses, colors, and document settings)
consistently.

To share the mechanism library directly rather than a single linkage, link to
**`app.pmksplus.com/?library`**.

---

## Mechanism Library

The built-in library includes **48 mechanisms** across eight categories, all covered by the
automated verification suite. You can filter by category or search by name. Opening a template on a
blank grid loads it immediately; opening one over an existing drawing prompts to open in a new
tab, replace the current drawing (undoable), or cancel.

![The Mechanism Library dialog, filtered to the Start Here section](docs/images/readme/templates.png)

*The top row below is animated; in the app, every library card animates on hover.*

<table>
<tr>
<td align="center"><img src="src/assets/gifs/four-bar.gif" width="190" alt="Four-Bar"><br><b>Four-Bar</b></td>
<td align="center"><img src="src/assets/gifs/slider-crank.gif" width="190" alt="Slider-Crank"><br><b>Slider-Crank</b></td>
<td align="center"><img src="src/assets/gifs/whitworth.gif" width="190" alt="Whitworth Quick-Return"><br><b>Whitworth Quick-Return</b></td>
<td align="center"><img src="src/assets/gifs/jansen-leg.gif" width="190" alt="Jansen Leg"><br><b>Jansen Leg</b></td>
</tr>
<tr>
<td align="center"><img src="src/assets/gifs/slider-crank-inversions.png" width="190" alt="Slider-Crank Inversions"><br><b>Slider-Crank Inversions</b></td>
<td align="center"><img src="src/assets/gifs/four-bar-inversions.png" width="190" alt="Four-Bar Inversions"><br><b>Four-Bar Inversions</b></td>
<td align="center"><img src="src/assets/gifs/cylinder-boom.png" width="190" alt="Cylinder-Driven Boom"><br><b>Cylinder-Driven Boom</b></td>
<td align="center"><img src="src/assets/gifs/parallelogram.png" width="190" alt="Parallelogram"><br><b>Parallelogram</b></td>
</tr>
<tr>
<td align="center"><img src="src/assets/gifs/aircraft-landing-gear.png" width="190" alt="Aircraft Landing Gear"><br><b>Aircraft Landing Gear</b></td>
<td align="center"><img src="src/assets/gifs/hood-hinge.png" width="190" alt="Car Hood Hinge"><br><b>Car Hood Hinge</b></td>
<td align="center"><img src="src/assets/gifs/excavator-bucket.png" width="190" alt="Excavator Bucket"><br><b>Excavator Bucket</b></td>
<td align="center"><img src="src/assets/gifs/car-steering.png" width="190" alt="Car Steering"><br><b>Car Steering</b></td>
</tr>
<tr>
<td align="center"><img src="src/assets/gifs/scotch-yoke.png" width="190" alt="Scotch Yoke"><br><b>Scotch Yoke</b></td>
<td align="center"><img src="src/assets/gifs/radial-engine.png" width="190" alt="Radial Engine"><br><b>Radial Engine</b></td>
<td align="center"><img src="src/assets/gifs/shaper-quick-return.png" width="190" alt="Shaper Quick-Return"><br><b>Shaper Quick-Return</b></td>
<td align="center"><img src="src/assets/gifs/pumpjack.png" width="190" alt="Pumpjack"><br><b>Pumpjack</b></td>
</tr>
<tr>
<td align="center"><img src="src/assets/gifs/windshield-wiper.png" width="190" alt="Windshield Wiper"><br><b>Windshield Wiper</b></td>
<td align="center"><img src="src/assets/gifs/oscillating-fan.png" width="190" alt="Oscillating Fan"><br><b>Oscillating Fan</b></td>
<td align="center"><img src="src/assets/gifs/cylinder-gripper.png" width="190" alt="Parallel Gripper"><br><b>Parallel Gripper</b></td>
<td align="center"><img src="src/assets/gifs/scissor-lift.png" width="190" alt="Scissor Lift"><br><b>Scissor Lift</b></td>
</tr>
<tr>
<td align="center"><img src="src/assets/gifs/chebyshev.png" width="190" alt="Chebyshev Straight-Line"><br><b>Chebyshev Straight-Line</b></td>
<td align="center"><img src="src/assets/gifs/peaucellier.png" width="190" alt="Peaucellier-Lipkin"><br><b>Peaucellier-Lipkin</b></td>
<td align="center"><img src="src/assets/gifs/elliptical-trammel.png" width="190" alt="Elliptical Trammel"><br><b>Elliptical Trammel</b></td>
<td align="center"><img src="src/assets/gifs/watt-straight-line.png" width="190" alt="Watt’s Straight-Line"><br><b>Watt’s Straight-Line</b></td>
</tr>
<tr>
<td align="center"><img src="src/assets/gifs/punch-press.png" width="190" alt="Punch Press"><br><b>Punch Press</b></td>
<td align="center"><img src="src/assets/gifs/toggle-clamp.png" width="190" alt="Toggle Clamp"><br><b>Toggle Clamp</b></td>
<td align="center"><img src="src/assets/gifs/crane-two-loads.png" width="190" alt="Crane with Two Loads"><br><b>Crane with Two Loads</b></td>
<td align="center"><img src="src/assets/gifs/offset-load-rocker.png" width="190" alt="Offset Load Rocker"><br><b>Offset Load Rocker</b></td>
</tr>
<tr>
<td align="center"><img src="src/assets/gifs/bell-crank.png" width="190" alt="Bell Crank"><br><b>Bell Crank</b></td>
<td align="center"><img src="src/assets/gifs/dwell-six-bar.png" width="190" alt="Six-Bar with a Dwell"><br><b>Six-Bar with a Dwell</b></td>
<td align="center"><img src="src/assets/gifs/stephenson-iii.png" width="190" alt="Stephenson III"><br><b>Stephenson III</b></td>
<td align="center"><img src="src/assets/gifs/double-butterfly.png" width="190" alt="Double Butterfly"><br><b>Double Butterfly</b></td>
</tr>
</table>

<details>
<summary><b>Full mechanism list by category</b></summary>

| Category | Mechanisms |
| --- | --- |
| **Start Here** | Four-Bar · Slider-Crank · Cylinder-Driven Boom · Parallelogram · Four-Bar with Fixed Lengths · Four-Bar Inversions · Slider-Crank Inversions |
| **Real Machines** | Aircraft Landing Gear · Car Hood Hinge · Excavator Bucket · Car Steering · Locking Pliers · Double-Wishbone Suspension · Steam Locomotive |
| **Back-and-Forth Motion** | Scotch Yoke · Engine with a Flywheel · Radial Engine · Whitworth Quick-Return · Shaper Quick-Return · Pumpjack |
| **Swing, Lift, and Grip** | Windshield Wiper · Oscillating Fan · Parallel Gripper · Scissor Lift · Bracketed Hatch |
| **Drawing a Path** | Chebyshev Straight-Line · Watt’s Straight-Line · Peaucellier-Lipkin · Elliptical Trammel · Pantograph · Jansen Leg |
| **Forces** | Punch Press · Toggle Clamp (in inches) · Crane with Two Loads · Offset Load Rocker · Reciprocating Saw · Slotted Tool Drive |
| **Six-Bars and Beyond** | Bell Crank · Six-Bar with a Dwell · Watt I · Watt II · Stephenson III · Elliptical Crank · Double Butterfly · Running Horse |
| **Multiple Mechanisms** | Walking Pair · Pumping Field · Approximate and Exact |

</details>

A five-step interactive **tutorial** walks new users through building a four-bar, grounding two
joints, assigning an input, animating it, and reading a velocity plot. Progress is tracked from the
mechanism state itself rather than click counts, so it stays in sync if you edit ahead or undo.

---

## Units, Settings, and Keyboard Shortcuts

<table>
<tr><th align="left">Length</th><td>in · cm · m</td></tr>
<tr><th align="left">Mass · inertia</th><td>g · kg (metric, chosen independently of cm/m) · lbm (with in), paired with length² for inertia</td></tr>
<tr><th align="left">Force · torque</th><td>N · kgf (metric) · lbf (with in), paired with length for torque</td></tr>
<tr><th align="left">Angle</th><td>degrees (°) · radians (rad)</td></tr>
<tr><th align="left">Input speed</th><td>RPM · deg/s · rad/s, or length/second for a linear drive</td></tr>
</table>

Settings also control **Gravity**, major and minor **Grid** lines, **Snap to Grid**, **Snap to
Alignment**, and **Drawing Style** (**Standard**, **Fine**, or **Schematic**—all scaling cleanly as
you zoom without affecting dimensions or analysis). Local preferences like snapping are saved on
your device.

<details>
<summary><b>Keyboard shortcuts</b></summary>

| | |
| --- | --- |
| **Modes** | <kbd>1</kbd> Synthesis · <kbd>2</kbd> Edit · <kbd>3</kbd> Kinematic Analysis · <kbd>4</kbd> Force Analysis |
| **Animation** | <kbd>Space</kbd> play/pause · <kbd>R</kbd> return to start · <kbd>←</kbd> <kbd>→</kbd> step a frame · <kbd>S</kbd> cycle speed |
| **View** | <kbd>+</kbd> <kbd>−</kbd> zoom · <kbd>0</kbd> fit to view · <kbd>M</kbd> center of mass · <kbd>L</kbd> joint and force names · <kbd>P</kbd> traced paths |
| **Editing** | <kbd>K</kbd> lock/unlock · <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> nudge selection · <kbd>Esc</kbd> deselect · <kbd>Delete</kbd> delete · <kbd>Ctrl/⌘ Z</kbd> undo · <kbd>Ctrl/⌘ ⇧ Z</kbd> redo |
| **Modifier keys** | <kbd>Ctrl/⌘ + click</kbd> multi-select · <kbd>Alt/Option + drag</kbd> bypass snapping · <kbd>Alt/Option + click</kbd> 15° steps · <kbd>Alt/Option + arrows</kbd> coarse nudge · <kbd>Shift + drag</kbd> fine-tune numeric fields |
| **General** | <kbd>,</kbd> Settings · <kbd>?</kbd> Help and shortcuts |

All shortcuts are defined in a single registry (`KeyboardShortcutsService`), and control tooltips
read directly from it so displayed hints always match active keybindings.

</details>

---

## Before Your First Change

**Read [`docs/environment.md`](docs/environment.md) before making your first change.** One codebase
convention applies everywhere: use
[American English](docs/code-style.md#spelling-american-everywhere) (`center`, `color`, `gray`,
`analyze`) in both identifiers and user-facing copy. The docs under `docs/` cover local setup, code
style, UI conventions, and known gotchas—if you hit a non-obvious issue, please document it in
[`docs/short-notes.md`](docs/short-notes.md).

---

## Verification

See [**pmksplus.com/validation**](https://pmksplus.com/validation) and
[`docs/numerical-oracle-plan.md`](docs/numerical-oracle-plan.md) for full methodology, tolerances,
and known limits.

- **Independent multibody oracle (Exudyn):** All **202 mechanisms** (every library template and
  verification fixture, totaling 250,000+ motion samples and nearly 160,000 force samples) are
  solved independently from their raw shareable URLs using
  [Exudyn](https://exudyn.readthedocs.io/). Both solvers agree on first- and second-order degrees
  of freedom across all 202 mechanisms (154 verified in kinematics and forces, 43 confirmed
  unrunnable, 5 documented exclusions). Reference outputs are committed so CI runs every check
  without extra runtime dependencies.
- **MATLAB reference suite:** Five mechanism configurations from
  [PMKS-Web/PMKS_Verification](https://github.com/PMKS-Web/PMKS_Verification) (a slider-crank with
  a tracer, Stephenson III, Watt I, and two teaching-lab cases) are compared row by row against
  MATLAB output at 1° input-crank increments, covering joint/angular kinematics in all five, CoM
  kinematics in three, and full dynamics in two.
- **Analytical and invariant suites:** Over 100 verification specs assert closed-form kinematic
  identities (Chebyshev straight-line midpoint, radial engine stroke, Jansen leg gait, etc.)
  alongside power-balance, mobility, assembly-branch, slot-tangency, and redundant-constraint
  checks.
- **Browser E2E tests:** Playwright suites exercise context menus, drag and snap gestures,
  wall-clock playback timing, and template graph consistency against finite-difference derivatives.

Measured November 2026:

| | |
| --- | --- |
| Application source | ~100,000 lines of TypeScript |
| Unit + verification specs | 368 files (~71,000 lines) |
| Exudyn oracle coverage | 202 mechanisms (154 verified · 43 unrunnable agreement · 5 documented exclusions) |
| MATLAB reference cases | 5 |
| Browser E2E scripts | Listed with coverage in [`e2e/README.md`](e2e/README.md) |
| Published fixture links | Every gallery fixture in [`docs/fixture-urls.md`](docs/fixture-urls.md) |

Every verification gallery fixture is also published as a clickable URL in
[`docs/fixture-urls.md`](docs/fixture-urls.md) so reviewers can open failing test cases directly in
PMKS. A unit test fails if that generated file falls out of date.

### Publications

- [A Tool to Analyze and Synthesize Planar Mechanisms](https://peer.asee.org/a-tool-to-analyze-and-synthesize-planar-mechanisms) — *ASEE Annual Conference, 2022*
- [Improving Features and User Experience of a Web-Based Linkage Analysis Tool Through User Studies](https://peer.asee.org/improving-features-and-user-experience-of-a-web-based-linkage-analysis-tool-through-user-studies) — *ASEE Annual Conference, 2025*
- [Laboratory on Experimental Verification of Four-Bar and Crank-Slider Linkages in a Senior-Level Design and Modeling Course](https://peer.asee.org/laboratory-on-experimental-verification-of-four-bar-and-crank-slider-linkages-in-a-senior-level-design-and-modeling-course) — *ASEE Annual Conference, 2026*

---

## Design Principles

Four engineering constraints shape most of the codebase:

### 1. A mechanism is a URL

Every joint, link, force, weld, lock, mass, color, and document setting serializes into one compact
URL-safe string. That single representation powers **sharing**, **saving**, and **undo/redo**. When
you open a shared link, PMKS decodes it and clears the query string from the address bar so the URL
doesn't go stale as you edit.

Background images (which can be large photos) and device preferences (such as snapping and center
of mass visibility) stay outside the URL.

Because shared URLs are a public compatibility surface, codec changes are guarded by round-trip
tests, and older builds reject links created by newer incompatible versions rather than misreading
them.

### 2. Explain disabled actions

Disabled controls should tell you why they're unavailable and what to do instead. Context-menu
refusals read directly from the model rules (`describeActuatorRefusal`, `weldRefusal`,
`locksHolding`) so the menu and the edit panel stay consistent.

<img alt="Three right-click menus with grayed rows and their reasons: '2 links share it', 'needs 2 links', 'inside a cylinder', 'ground an end joint instead'" src="docs/images/context-menu/refusals.png" width="820">

Analysis tabs follow the same pattern: when a mode isn't ready, its badge shows the number of
remaining issues, and clicking it opens a checklist linking directly to the affected parts.

### 3. Consistent UI vocabulary

User-facing copy follows [`docs/ui-vocabulary.md`](docs/ui-vocabulary.md): **Add** on the blank
grid, **Attach** on an existing part, **Delete** for removal, and one canonical term per concept
(**Reference Frame** with **Link** / **Grid**, **Revolute** / **Prismatic** / **Pin-in-slot** / **Welded**,
**Return to Start**). Control labels use Title Case; messages and tooltips use plain, direct
sentences.

> Instead of `Cannot edit while in Synthesis mode` → **`Switch to Edit mode to change the mechanism.`**

### 4. Independently verified solvers

Solver accuracy is tested against independent tools (Exudyn across 202 mechanisms and MATLAB across
5 reference cases), with reference outputs committed to the repo for CI. Every gallery fixture is
also published as a clickable link in [`docs/fixture-urls.md`](docs/fixture-urls.md) for quick
visual inspection.

---

## Architecture

```
                    ┌──────────────────────────────────────┐
  ?<shared url> ───▶│  UrlProcessor  →  MechanismBuilder   │
                    └───────────────────┬──────────────────┘
                                        │
                    ┌───────────────────▼──────────────────┐
                    │  MechanismService                    │  editable drawing:
                    │  joints · links · forces at t = 0    │  create · delete · weld ·
                    └───────────────────┬──────────────────┘  ground · slider · drive
                                        │
                    ┌───────────────────▼──────────────────┐
                    │  partition into independent          │  M1, M2, M3…
                    │  mechanisms                          │
                    └───────────────────┬──────────────────┘
                                        │
      ┌───────────────┬─────────────────┼─────────────────┬──────────────────┐
      ▼               ▼                 ▼                 ▼                  ▼
 loop-solver    position-solver   kinematic-solver   force-solver       readiness
(find loops)   (every timestep)   (velocity, accel)  (static/dynamic)   (blockers)
                                        │
                    ┌───────────────────▼──────────────────┐
                    │  UrlGeneration  →  share · save      │
                    │                    · undo / redo     │
                    └──────────────────────────────────────┘
```

- **State lives in root services.** `MechanismService` owns the editable drawing; each partition is
  copied into a `Mechanism` that solves its full cycle up front so scrubbing is an instant lookup.
  Large drawings defer full solves while editing and solve on demand when entering analysis.
- **Undo/redo uses URL snapshots.** `SaveHistoryService` stores an array of encoded mechanism URLs.
- **Standalone Angular 22.** No `NgModule`s; all components declare their own imports.
- **Single SVG canvas with centralized permissions.** `ContextMenuBuilderService` builds menus from
  the clicked target and active mode, sharing permission checks with the Edit panel and canvas
  gestures.

See [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md) for a fuller map of the codebase and
conventions.

---

## Development

Requires **Node 22.22.3+, 24.15+, or 26+** (`.nvmrc` pins Node 24).

```bash
git clone https://github.com/PMKS-Web/PMKS.git
cd PMKS
npm ci
npm start          # http://localhost:4200
```

| Command | Description |
| --- | --- |
| `npm start` | Dev server with live reload |
| `npm run build` | Production build into `dist/pmksweb` |
| `npm test -- --watch=false` | Run the Vitest suite (omit the flag for watch mode) |
| `npm run check` | Run all CI linters: ESLint, stylelint, and Prettier |
| `npm run format` | Format the repository with Prettier |
| `npm run storybook` | Launch the component gallery and UI guides at `http://localhost:6006` |
| `npm run fixture-urls` | Regenerate [`docs/fixture-urls.md`](docs/fixture-urls.md) |
| `npm run template-payloads` | Regenerate mechanism library payloads |
| `npm run brand` | Regenerate unified PMKS logos, icons, favicons, and social card (see [`docs/brand.md`](docs/brand.md)) |
| `node e2e/readme-shots.mjs` | Regenerate the screenshots embedded in this README |

Playwright E2E scripts live in [`e2e/`](e2e/README.md) and run directly with Node (`netlify.toml`
skips Playwright browser downloads during Netlify deploys). Run `npm run format` before pushing so
Prettier checks pass in CI. See [`docs/environment.md`](docs/environment.md) for additional setup
notes.

### Branches and deploys

- **Target `staging` for all pull requests.** Releases are promoted from `staging` to `main` via a
  dedicated release PR.
- **Do not push directly to `main`.** `main` is the production branch for
  [app.pmksplus.com](https://app.pmksplus.com).
- **Production deploys are manual in Netlify.** Merging to `main` does not publish automatically
  until a deploy is triggered in Netlify.
- PRs into `staging` or `main` get deploy previews at
  `https://deploy-preview-NNN--pmksprod.netlify.app`, and `staging` publishes to
  `https://staging--pmksprod.netlify.app`.
- CI runs ESLint, stylelint, Prettier, unit tests, the production build, Storybook build, and
  `git diff --check` on every PR.
- `package.json`'s `version` field is displayed in Settings; bump it in the release PR.

---

## Contributing

Tracked work lives on the [project board](https://github.com/orgs/PMKS-Web/projects/1). Fork,
branch from `staging`, and open a PR targeting `staging` with a brief summary of why the change is
needed, what changed, and how it was verified.

Guidelines:

1. **Comment *why*, not *how*.** Keep code self-explanatory and use comments to explain design
   constraints and trade-offs.
2. **Keep files focused.** Split files by responsibility and keep functions concise. See
   [`docs/code-style.md`](docs/code-style.md) for Angular and TypeScript conventions; run
   `npm run check` to verify.
3. **Follow Angular naming conventions:** `foo-bar.service.ts`, `FooBarComponent`, `app-` selector
   prefix.
4. **Add test mechanisms to `FIXTURE_GALLERY`** rather than inline in a spec so they automatically
   get published URLs and oracle coverage.
5. **Treat the URL codec as a public contract.** Avoid breaking existing shared links.
6. **Follow the UI guides for user-facing changes:** [`docs/ui-style-guide.md`](docs/ui-style-guide.md)
   covers interaction and layout rules, [`docs/ui-vocabulary.md`](docs/ui-vocabulary.md) defines UI
   terminology, and Storybook (`npm run storybook` / [docs.pmksplus.com](https://docs.pmksplus.com))
   documents reusable UI blocks.

---

## License and Contact

MIT License — see [LICENSE](LICENSE) for the full text.

For questions, bug reports, or course-adoption inquiries, email **help@pmksplus.com** or use the
in-app feedback form (**Help** in the project menu).

---

## Supporting PMKS

PMKS is free and open source, with no accounts or paid tiers. If it has been helpful for you or
your class, you can support hosting and maintenance at **[ko-fi.com/pmksapp](https://ko-fi.com/pmksapp)**.
100% of donations (after payment-processor fees) go directly toward hosting, development, and
outreach.

Donations go to the project's maintainer rather than Worcester Polytechnic Institute, are not
tax-deductible, and do not unlock extra features—everyone gets the same app.

---

## Acknowledgements

PMKS is based on the **original PMKS**, developed by **Prof. Matthew I. Campbell**, Professor of
Mechanical Engineering, Oregon State University.

### Faculty

- Prof. David Brown (CS)
- Prof. Pradeep Radhakrishnan (ME, RBE)

### Contributors

<table>
<tr><td>David Peterson (CS '28)</td><td>Randy Gomez (CS '28)</td><td>Adel Benchemam (Mass. Academy of Math and Science '26)</td></tr>
<tr><td>Jeremy Bornstein (CS '25)</td><td>Jagruti Chitte (CS '25)</td><td>Gabriel Curet-Irizarry (CS '25)</td></tr>
<tr><td>Javier DeLeon (CS '25)</td><td>Matthew Gatta (CS '25)</td><td>Sebastian Gurgol (CS '25)</td></tr>
<tr><td>Jessica M. Rhodes (BS/MS RBE '25)</td><td>Ansel Chang (CS '25)</td><td>Lucas Panta (Worcester Technical High School '25)</td></tr>
<tr><td>Naseem Blount (Worcester Technical High School '25)</td><td>Jacob Adamsky (CS '24)</td><td>Kohmei Kadoya (BS/MS RBE '23)</td></tr>
<tr><td>Alex Galvan (BS ME/RBE '21)</td><td>Haofan Zhang (BS/MS CS '20)</td><td>Trevor Dowd (BS CS '20)</td></tr>
<tr><td>Robert Dutile (BS CS '20)</td><td>Milap Patel (BS ME/CS '20)</td><td>Peter Prygocki (BS CS '20)</td></tr>
<tr><td>Fabian Gaziano (BS CS '20)</td><td>Michael Taylor (BS CS '19)</td><td>Griffin Cecil (BS CS '19)</td></tr>
<tr><td>Dimitrios Tsiakmakis (BS CS '19)</td><td>Praneeth Appikatla (BS CS '19)</td><td>Zhihao Xie (BS RBE '19)</td></tr>
<tr><td>Albert Nana Beka (BS/MS ME '19)</td><td>Jonathan Andrews (BS RBE '18)</td><td>Brandon Knox (BS RBE '18)</td></tr>
<tr><td>Guillermo Rivera (BS RBE '18)</td><td>Brad Leach (BS ME '18)</td><td>Garrett Holman (BS ME '18)</td></tr>
<tr><td>Oluchukwu Okafor (BS ME '18)</td></tr>
</table>

<div align="center">

**[Open PMKS →](https://app.pmksplus.com)** &nbsp;·&nbsp; **[pmksplus.com](https://pmksplus.com)**

</div>
