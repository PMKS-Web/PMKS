# Editing rules: what may change, where, and when

> **Status:** Current. This is the rule every control follows. `model/edit-permission.ts` puts it
> into code, and every surface (the context menu, the Edit panel, the canvas, the keys) asks that
> model instead of deciding for itself.

## The idea

**A reader must never be able to get stranded.**

A stranded reader has changed the mechanism into something that no longer runs, in a place where
the fix is out of reach. For example: mid-cycle, or in an analysis mode with nothing that works.
Every rule below follows from protecting against that:

1. **The mechanism is designed in Edit, at its start pose.** That is the one place where every
   change is offered, because that is where any change can be undone, retyped or rebuilt.
2. **Away from the start, the reader is looking, not designing.** Only changes that cannot break
   the mechanism, and that have a defined way back to the start pose, are offered.
3. **The analysis modes are for reading the motion.** They offer only what a reader needs to ask
   a question of the motion: something to measure (a tracer point), something to load it with (a
   force), and a way to try a different shape (dragging). Nothing else.
4. **While anything plays, nothing changes.** Pause first.
5. **Every place that offers an action gives the same answer.** The Edit panel, the context menu,
   the canvas and the keyboard are four doors to one set of actions. If an action can be done
   through one of them, it can be done through every one that offers it; if one refuses it, all
   of them refuse it, with the same reason. A reader must never find a button live in the panel
   that the menu grays, or the other way round. Issue #256 was that bug: the menu grayed Add
   Tracer Point and Add Force while the panel's buttons still worked.

## The rules as a table

Every control belongs to exactly one kind. Find the kind, then read off the answer.

| Kind of control | Examples | Edit, at start | Edit, paused mid-cycle | Analysis, at start | Analysis, mid-cycle |
| --- | --- | --- | --- | --- | --- |
| **View** | Trace Path, velocity and acceleration traces, joint IDs, zoom, deleting a synthesis position, removing the background image | Yes | Yes | Yes | Yes |
| **Annotation** | Add or delete a tracer point; add or delete a force | Yes | No | Yes | No |
| **Gesture** | Drag a joint, a link, a force or a center of mass | Yes | Yes, put back on the start anchor | Yes | Yes, put back on the start anchor |
| **Safe property** | Mass, moment of inertia, name, color, Lock, Fixed Length, Fixed Angle, Drawn as a Disc | Yes | Yes | No | No |
| **Load** | A force's magnitude, Flip Force | Yes | Yes | Yes | Yes |
| **Typed geometry** | Joint X/Y, length, angle, typed center of mass, Slider Angle, *Starts at*, Distance to Joints, an arrow-key nudge, a force's typed angle and frame, input speed and direction | Yes | No | No | No |
| **Structure** | Add a link or cylinder, delete, duplicate, Joint Type, Split Joint, Grounded, Add Input, Delete Entire Mechanism | Yes | No | No | No |

While anything plays, every row is **No**, except the transport and selecting.

Synthesis mode edits only its own positions; none of the rows above apply there.

## How to use this for a new control

1. **Decide its kind** by asking what could go wrong with it:
   - Does it change *which* parts exist or how they connect? That makes it **Structure**.
   - Is it a number or choice the reader types that places something (a coordinate, a length, an
     angle, a direction)? That makes it **Typed geometry**. **A position is only ever typed at the
     start pose.** The design *is* the start pose, so that is the only pose whose numbers mean
     anything to type. Away from it, the panel shows the values at the pose on screen, and nobody
     should be typing those: they change the moment the mechanism moves on, and writing one would
     have to guess whether the reader meant this pose or the design. A drag is different, and
     allowed, because it says "put it here, at this pose" and the app can carry that back to the
     start.
   - Does it change how hard a force pushes, or reverse it, without moving or turning anything?
     That makes it **Load**. A force's magnitude and Flip Force read the same at every pose, so
     they are offered whenever the mechanism is paused, in Edit and in the analysis modes:
     changing the load and watching the force graphs answer is what Force Analysis is for.
     `MechanismService.editForcesAtPose` carries the change back to the start. A force's typed
     angle and frame are not Load: an angle is a direction, so it is typed geometry.
   - Does it add or remove a tracer point or a force? That makes it an **Annotation**.
   - Is it a drag of a joint, a link, a force or a center of mass? That makes it a **Gesture**. A gesture means
     "put it here, at this pose", and the app can honor that at any paused pose by putting the
     design back on its start anchor underneath. A dragged center of mass maps back through its
     body's motion before saving, including when its typed fields use a joint or the grid origin.
   - Can it change without affecting whether the mechanism runs or where anything is? That makes
     it a **Safe property**. Mass, color and name are the examples.
   - Does it only change what is drawn, not the document? That makes it **View**.
2. **Ask the permission model for that kind.** Never write `isAtStartPose()`,
   `isAnalysisMode()` or `isPlaying` into the control to decide it. A control that answers for
   itself is how the menu and the panel came to disagree (issue #256).
3. **Keep the panel and the menu in sync (principle 5).** If the Edit panel has a button with the
   menu's name, both ask the permission model the same question and both quote the same reason.
   When you add an action to one, check whether the other offers it too, and wire both in the
   same change. A spec that checks one surface should check the other.
4. **A refused control is grayed, not hidden, and says why.** The reason also names the way
   out: *Return it to the start*, or *Switch to Edit*.

If a new control does not fit one kind, do not invent an exception inside the control. Add the
kind here first, with the reason, and then to the model.

## Things that sit outside the table

- **Document settings** (units, gravity, grid) belong to the whole drawing, not to one part.
  They change at the start pose in Edit and in the analysis modes, never mid-cycle, because a
  unit change rescales every stored coordinate.
- **Undo and redo** follow the gesture rule in Edit, and are allowed in the analysis modes so a
  bad drag there is never stranded behind a mode switch.
- **The force-analysis setup drawer's mass table** is a safe property shown in an analysis mode.
  It is the one place an analysis mode offers a safe property, because force results depend on it.

## Why the earlier rules were changed

The paused-pose work (`docs/edit-mode-playback-plan.md`) and the analysis-editing work
(`docs/analysis-mode-editing-plan.md`) opened many changes at a mid-cycle pose and in the analysis
modes, mapped back to the start through each body's motion. The mapping was correct, but the
freedom was not worth it: a reader could restructure a mechanism mid-cycle, or delete and retype
it from inside Kinematic Analysis, until nothing ran and the only way out was to leave the mode.
These rules close those doors. The machinery that maps a drag back to the start is kept, because
the gesture row still uses it in Edit.
