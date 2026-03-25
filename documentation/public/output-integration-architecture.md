# Baryon Output Integration Architecture

This document explains the public architecture for Baryon's host/output integration path.

It focuses on the shared design and contract boundaries rather than the implementation details of any specific private host product.

## Purpose

Output integration exists so a source surface can drive an external-output surface without making the output backend responsible for the shared visualization engine itself.

Current design goals:

- keep one source of truth for render/runtime state
- mirror the right state into a sink surface
- preserve fast bootstrap and reconnect behavior
- keep frame delivery observable enough to debug stalls and desync
- keep host-specific output code outside the shared visualization semantics

## High-Level Shape

The current integration branch looks like this:

```text
source surface
  -> source controller
  -> transport messages
  -> output coordinator
  -> sink surface
  -> redirected rendering
  -> host output backend
```

The key design point is that the sink surface still uses the shared visualizer stack. Host-specific work should be the synchronization and delivery layer around that stack, not a second renderer implementation with different semantics.

## Main Components

### 1. Source controller

Responsibilities:

- read host-output status
- keep renderer eligibility and performance-profile state aligned
- publish render snapshots
- publish audio feature frames
- cache the latest messages for replay after reconnect/bootstrap
- sync UI-driven performance-profile changes back into host output config

The source surface remains the authoritative owner of current controls, method, and frame state.

### 2. Output coordinator

Responsibilities:

- manage one source connection and one or more sink connections
- track readiness, bootstrap state, render acknowledgments, and frame delivery
- move only the latest relevant audio frame toward the sink
- buffer or drop superseded in-flight frames rather than letting the sink drift indefinitely
- publish diagnostics for source/sink state

This coordinator is the traffic-control layer between the source surface and the sink surface.

### 3. Host output controller

Responsibilities:

- own output configuration and status
- manage sink-surface lifecycle
- wire the coordinator into the host runtime
- manage redirected rendering
- manage the host-specific output backend
- expose diagnostics and failure state back to the app shell

This is where host-specific behavior should live.

### 4. Sink sync layer

Responsibilities:

- receive transport messages at the sink
- merge incoming control/render state into local sink state
- keep a local external-frame reference for rendering
- emit readiness and rendered acknowledgments
- maintain light debug state about connection health and frame cadence

This is the sink-side bridge between the transport protocol and the shared visualizer surface.

## Message Flow

The protocol is built around a small set of message classes:

- render snapshots
- audio feature frames
- sink ready
- bootstrap
- bootstrap acknowledgment
- rendered-frame acknowledgment

Typical flow:

1. the source side connects and starts publishing snapshots/frames
2. the sink comes up and announces readiness
3. the coordinator marks the sink ready and begins bootstrap delivery
4. source-side cached state is replayed so the sink can initialize quickly
5. the sink renders and acknowledges progress
6. steady-state frame delivery continues, with the coordinator buffering or dropping superseded frames when necessary

The important property is that the sink must become visually correct quickly without requiring a restart of the source surface.

## State Ownership

Treat ownership like this:

### Source side owns

- live control state
- current visualization method
- current performance profile
- latest authoritative render snapshot
- latest authoritative audio feature frame

### Sink side owns

- connection state
- locally merged sink state used for rendering
- rendered-frame acknowledgments
- sink-side debug visibility

### Host controller owns

- output config and status
- backend lifecycle
- sink lifecycle
- publication of delivered frames

Do not invert these responsibilities casually. In particular, the sink should not become a second independent source of truth for control semantics.

## Compatibility Surfaces

Important compatibility surfaces include:

- visualization method values
- performance-profile compatibility fields
- frame sequencing and replay behavior
- readiness/bootstrap/ack ordering

Any change here should be treated as protocol work, not as a local cleanup.

## Failure Modes To Expect

Common failure classes:

- sink connected but not bootstrapped
- sink ready but not rendering
- source publishing but sink falling behind
- output backend available but receiving no usable frame data
- sink visually correct while output publication is stalled
- main preview correct while sink state is stale

This is why the stack keeps diagnostics at multiple layers instead of trusting only the backend.

## Debugging Order

When output integration is wrong, debug in this order:

1. confirm the source surface shared visualizer is correct
2. confirm the source controller is publishing current method/profile/frame state
3. confirm the coordinator shows the sink connected, ready, and bootstrapped
4. confirm the sink is receiving snapshots and advancing frame sequence
5. confirm redirected rendering and frame publication are happening
6. only then blame the host output backend

This order matters because many “output backend bugs” are really earlier synchronization failures.

## What Should Stay Stable

Unless the task explicitly changes the output model, preserve:

- one source of truth for render/runtime state
- readiness/bootstrap/ack handshake
- render-snapshot plus audio-feature-frame split
- compatibility field names at host boundaries
- separation between shared visualizer behavior and host-specific output delivery
