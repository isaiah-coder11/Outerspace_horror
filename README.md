# VOID SHIFT — EREBUS-9

A short first-person horror maintenance game built with Three.js and Vite.

You are a **passenger** on the liner **EREBUS-9**, woken mid-crossing by the
emergency klaxon. The crew is gone. Three compartments still fail every day, and
the only way off the ship is to keep the hull together long enough to build the
escape pod. At night, ship control falls — and the hull never stops cracking.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production bundle in dist/
```

Requires a browser with WebGL and a mouse + keyboard.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrows | move |
| mouse | look (pointer lock; if the cursor stays visible, hold left click and drag) |
| `Shift` | run |
| `E` | interact / confirm / shift past the thing standing in the corridor |
| `Q` | close the end-shift dialog |
| `Esc` | pause |

The suit has mass. Movement accelerates and coasts instead of starting and
stopping instantly, the helmet view eases toward your mouse, and the camera leans
with turns and lateral drift.

## The opening

The run starts inside your cryo pod: a red strobe, the siren, the words
`PASSENGER CRYO · BERTH 14`, and a single `OPEN THE POD` control. The wake
screen says who you are before it says how to play — you paid for a berth, you
are not crew, and nobody is answering the hail.

Opening the pod starts the first shift under **red alert**: a pulsing red wash
over the visor, a klaxon every couple of seconds, and a ship log that tells you
the crew is gone. The alarm fades after roughly half a minute and the rest of
the run is the quieter, worse kind of failure.

## Rules

- The **SHIP CONTROL** bar at the top starts at 100%. It is the hull, life support
  and navigation holding together as one number.
- **ENERGY** drains as you walk and falls fast when you sprint. Standing still
  recharges it. **HUNGER** drains slowly all day. At near-zero energy or hunger
  your movement slows and the visor dims.
- **Hydro Bay** (east) grows one meal per day. Harvest it to gain **+45 hunger**
  and **+25 energy**. It does not grow back until the next day.
- Three rooms — **Reactor Bay** (north), **Hydro Bay** (east), **Nav / Comms**
  (west) — each hold one daily task. Access them through the hub and its three
  corridors.
- Every compartment runs on a **reserve** and burns a different one. Reactor
  burns **BIOMASS** to make **POWER**, Nav burns **POWER** to make **DATA**, and
  Hydro burns **DATA** to make **BIOMASS**. You start with 30 of each.
- Each repair step costs **1** of the room's incoming reserve and pays **1** of
  its own; finishing a task pays a bonus of **4**. The panel lists each room's
  cost and payout, and an empty reserve locks its units until the producing bay
  runs again.
- There is no morning refill. The tanks hold only what the bays produced and
  the night's leak left behind, so a shift has to earn the reserves its own
  repairs burn. What survives that is what the pod and the crack welds come out
  of.
- **Nights 1–3** are for learning: no reserve leak at all.
- **Nights 4–6** the first cracks show and reserves start **−2, −3, −4** a night
  — noticeable, still comfortable against the roughly four a healthy bay
  produces.
- **Nights 7–9** the leak climbs to **−5, −5, −6**. Everything can still be
  fixed, but there is little left over.
- **Nights 10–13** it reaches **−7, −8, −9, −10**. Now there are real tradeoffs:
  weld the crack, run the task, or bank for the pod.
- **Night 14 and after** the leak is **−11 → −15** a night and the ship is
  genuinely coming apart.
- Every repair step also needs the right **tool** in your **backpack**: a
  **WRENCH** for Reactor Bay, a **FILTER** for Hydro Bay and a **PROBE** for Nav /
  Comms. Each tool is stocked in a *different* bay's supply locker — the wrench
  sits on the **antenna rack** in Nav / Comms, the filters in the **coolant
  locker** in Reactor Bay, the probes in the **hydro cabinet** in Hydro Bay — so
  every step is a walk across the ship.
- The backpack holds **4** tools. Press `E` at a locker to take one, then `E` on a
  repair unit to work it: the step spends the tool for good. Without the tool the
  unit refuses and nothing is burned, and the pointer switches to the locker that
  stocks it.
- The lockers **restock every morning with less than the morning before** — 5, 4,
  3, 2, then 1 tool each — but never below the presses that day's task will
  actually ask for, and a cycle task takes two presses per unit. Early shifts
  can afford a wasted tool; late ones still have to plan the walk.
- Each reserve also shows the **next night's leak** beside its total, and the line
  under the row warns when a bay will be dry or nearly dry by morning — naming
  the compartment that will stall first.
- The **SHIFT** clock in the top right starts at **04:00**. It pauses while a
  dialog or pause screen is open. At **00:00** the ship forces the cryo pod on you
  and the night begins.
- End the day early by entering the **cryo pod** in the central hub (behind your
  starting position).
- The first two nights are **stable** — ship control does not fall, even if tasks
  are unfinished.
- From **Day 3**, unfinished maintenance costs **−10%** ship control that night.
  Finish all three tasks and the hull holds: there is no flat decay for a stable
  ship.
- From **Day 5** hull cracks open on walls and floors. A crack costs its own
  severity in ship control every night and
  widens by 1% a night, to a 5% maximum, at which point another crack tears
  open. Welding a crack costs a single reserve of any kind and takes 1% off it.
- At **0%** the run ends. Whatever ends the run — the hull giving out or the
  thing reaching you — it lunges into the visor before the failure card appears.
  Survive as many shifts as you can.

## The escape pod

South of the central hub, down the south corridor, sits the escape bay: a
half-built pod on a launch cradle with a build console in front of it.
Assembling it costs **40 reserves** (14 power, 13 biomass, 13 data) and, once
built, launching it finishes the run — you leave Erebus-9. The clamps stay shut
until **ten shifts** have logged hull pressure, so it cannot be a first-day win
and lands in the late-game choice between welds, jobs and saving.

The pod also stays sealed while hub security is below **30%**, so a failing ship
cannot be abandoned. Once control is back above 30%, the clamps still refuse
while any job is unfinished or any hull crack is open. A refusal spends nothing,
so the reserves the jobs and welds demand are exactly the reserves the pod wants.

## Corridors and vents

The corridors are the worst place on the ship. Each one is lit below the
compartments and lined with red emergency strips that stutter, and cables hang
low enough to brush the helmet. Walking into one kills a light and pulls a
creak out of the hull; stay in one and the ship starts working on you — footsteps
that keep your pace and stop when you do, a shape between the lights, the air
turning warm and wet for a second.

Vents are worse. Their grates sit over a throat of dark with pale teeth behind
the slats, and the eyes in them blink at their own pace. What they do depends on
how much of the ship you still hold:

| Ship control | Vents |
| --- | --- |
| 100–80 | They watch — but not always and not everywhere. A grate is often just a grate: the pale eyes and teeth surface in its throat for a few seconds and sink back, each vent on its own clock, longer and more often as control falls. Now and then a face leans out of a grate at an angle, half behind the slats, stays for a breath or two, and is gone — then back at another grate, at no set rhythm. Meet its eyes and it leaves at once, and you hear it moving away inside the wall. |
| 80–50 | The grate rattles as you pass, and when the eyes are actually out the visor fogs red with scanlines. No face in the grate, no red — walking past a vent is not a scare on its own. Tense, never a jumpscare. |
| 50–20 | The jumpscare is real: lean in close and the thing lunges out of the wall. It never costs ship control, so it cannot end the run. |
| 20–0 | It comes all the way out of a vent, and then it hunts. |

Walk a corridor and a head and shoulder may be waiting just past the far door
frame, in the room you are heading toward. It is only there while you are
actually walking: stop and the doorway is empty, stare and it slips back. If you
keep going it steps out from behind the frame and plants itself in the way — you
stop against it, and `E` is how you shift round it.

Standing in a compartment and working a repair also draws whispers — finishing a
task does not mean the room has stopped watching.

## The thing in the ship

The monster escalates with ship control. At night, ship control falls and the
thing gets bolder, even on days when every task is finished. It is gaunt and
wet-skinned, slung forward on arms that reach past its knees; where eyes should
be there are two white rings, and the jaw hangs open on a ring of needle teeth.
The same body is the watcher in the dark, the hunter that walks at critical
control, and whatever lunges at the visor when the run ends: it hangs back for a
breath, the jaw hinges open, its head snaps side to side, both arms come up for
the grab, and then the face hits the glass. The visor throws itself ten pixels
left and right, a red warning border closes in, and it screeches the whole way
in before the flash takes the screen.

| Ship control | Behaviour |
| --- | --- |
| 100–80 | It lurks out of sight and peeks: a face in a vent or a shoulder past a door frame, gone the moment you look straight at it. |
| 80–50 | It appears in a door frame with no warning, holds until you meet its eyes, and is gone. The vents breathe when you get close. |
| 50–20 | It waits in the corridor without moving, and the vents start throwing jump scares that cannot kill you. Get within a couple of metres of the lurker and it grabs you. |
| 20–0 | It pulls itself out of a vent, then hunts. The chase starts at 1.3 m/s and closes on 3 m/s as the hull dies. |

The corridor grab is a struggle: **mash SPACE** to fill the bar inside the
four-second window. Breaking free burns ten units of whichever reserve you hold
most of — power, biomass or data. With every reserve at zero there is nothing
to burn, and it does not let go.

From **Day 5** the hull opens hairline cracks. Every night the fractures spread
and widen, whether or not the jobs were finished. The same leaks eat into the
compartment reserves — **−2** a night from Day 4, climbing to **−7** by Day 10
and **−14** by Day 17 — so a shift that skips a room eventually strands the room
downstream of it.

Tasks are drawn from nine hand-built variations (three per room) and rotate each
day: activate units in a displayed order, service every unit in a room, or cycle
each unit through states until it reads clean. Every one of them is multi-step,
and every step needs a tool from a locker in another bay plus a reserve from
another bay, so a shift is a loop between the stores and the work. The opening days are gentle —
Day 1 uses simple service tasks, Day 2 introduces sequences, and every archetype
is in rotation from Day 3.

Nothing on the ship is marked unless you ask for it. Clicking a compartment's
row in the **Today's jobs** panel — or pressing `1`, `2` or `3` — is the waypoint
control, and it marks that job and nothing else: the next unit that still needs
attention (sequence tasks mark only the next one), and, while you are not
carrying the tool, the locker that stocks it. So a stalled repair points at both
the work and the tool in one look.

Pressing the same row again clears them, and with nothing selected the screen
carries no pointers at all — no cracks, no pod, no other bays. The row itself
lights up while it owns the waypoints, and the log line names the two stops.

Two things that are not jobs get their own buttons under the heading:
**⌖ ESCAPE BAY** and **⌖ HULL CRACKS**, the second carrying the number of open
cracks and dead when the hull is whole. They follow the same rule — one mark at
a time, press again to clear — so the escape pod and the hull are one click
away without ever being on screen unasked.

## Today's jobs

Every row in the panel states the job, **why the ship needs it**, exactly what to
press, the tool and locker it wants, and the reserve it burns. The nine jobs are:

| Bay | Job | Why the ship needs it |
| --- | --- | --- |
| Reactor | **Reroute the power conduits** | Press the three conduits in the shown order; the route is arcing and POWER cannot flow through it. |
| Reactor | **Close the coolant valves** | Press all four valves; the core is venting coolant and cannot hold pressure. |
| Reactor | **Seat the control rods** | Two presses per rod until it reads SEATED; the core runs hot until all three are down. |
| Hydro | **Pick the growth pods** | Press all three pods; they are your food and the ship's BIOMASS. |
| Hydro | **Clean the nutrient lines** | Two presses per line until CLEAN; dirty lines poison the crop and stop BIOMASS. |
| Hydro | **Pollinate the trays** | Press the trays in the shown order; without pollination the crop never sets. |
| Nav | **Point the antennas** | Press the dishes in the shown order; with the array down the ship is flying blind. |
| Nav | **Read the drift sensors** | Press all three sensors; the ship does not know where it is. |
| Nav | **Lock the transmission** | Two presses per console until LOCKED; a locked signal is the only way NAV makes DATA. |

## What's inside

- `src/main.js` — game loop, suit-momentum movement and collision, energy/hunger
  and shift clock, interactions, day/night cycle, HUD and waypoint wiring, monster
  phases and horror event scheduling.
- `src/world.js` — ship geometry, procedural textures, lighting, props, hull
  cracks, vent eyes, blood decals, the watching apparition and the hunter.
- `src/tasks.js` — item meshes, the nine tasks and task runtime logic.
- `src/audio.js` — fully procedural WebAudio ambience (drone, wind, whispers,
  creaks, the wake klaxon, interface tones, heartbeat); no audio files.
- `src/style.css` — HUD, wake screen, red-alert wash, night sequence, end-shift
  dialog and game-over overlays.

There are no image, model or audio assets: every texture and sound is generated
at runtime.

## Saving and resetting

Progress is stored in `localStorage` after each task interaction, at the start of
every day, and when the page is hidden or closed (day, ship control, energy,
hunger, compartment reserves, backpack contents, locker stock, remaining shift
time, whether today's meal was harvested, task selection, sequence orders and
which units have already been serviced). Older saves without reserves or tools
start with the full compliment and a full backpack of nothing.

Refreshing the page shows a **RESUME SHIFT** button with the saved day and ship
control value. **Reset shift** (click twice to confirm) erases the save and
starts a new run from Day 1. A run that ends in ship-control failure or in the
monster clears its save automatically.
