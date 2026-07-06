# Gym WRO Dashboard

A polished prototype dashboard for a wearable muscle-fatigue and rep-quality monitoring system designed for resistance training. The project focuses on turning subjective workout feedback into a clearer, more measurable experience by combining muscle activity and motion data into a simple operator dashboard.

## Overview

Gym WRO is a concept for a wearable sensor system that helps lifters understand:

- how close they are to muscular failure,
- whether their final reps are still high-quality reps,
- and how fatigue, rep speed, and range of motion change over the course of a set.

The current prototype is a front-end dashboard experience that presents the intended workflow for connection, calibration, live feedback, and post-set summary.

## Problem Statement

Many lifters rely on feel rather than measurable data when deciding whether they trained hard enough. For hypertrophy-focused training, the final difficult reps matter a lot, but it can be difficult to know whether someone truly reached failure, stopped too early, or used momentum or poor form.

This dashboard is built to help visualize that idea in a clean and practical way.

## Proposed Solution

The concept combines:

- surface EMG data for muscle activation and fatigue trends,
- IMU motion data for rep speed, range of motion, pauses, and motion quality,
- and a simple dashboard that presents live feedback and a summary after the set.

The goal is not to be perfect yet, but to demonstrate that meaningful trends can be surfaced for training feedback.

## Core Features

The current prototype includes:

- connection screen with demo and USB-style workflow options,
- calibration screen with a simple baseline setup flow,
- live set dashboard with rep count, speed, ROM, fatigue status, and charts,
- post-set summary cards and notes,
- CSV export support for future dataset review.

## UI / UX Direction

The interface is intentionally designed to feel:

- classy,
- minimal,
- calm,
- and practical for a prototype control panel.

The current experience uses placeholder interactions where live sensor integration is not yet connected, so the UI can be reviewed and refined before full hardware functionality is added.

## Project Files

- [gym-wro-dashboard.html](gym-wro-dashboard.html) — main HTML structure
- [gym-wro-dashboard.css](gym-wro-dashboard.css) — styling and layout
- [gym-wro-dashboard.js](gym-wro-dashboard.js) — dashboard interactions and placeholder modal behavior

## Screenshots

### Prototype Preview

![Expected Prototype](<Expected%20Prototype.png>)

## How to Run

Since this is a static web prototype, you can open [gym-wro-dashboard.html](gym-wro-dashboard.html) directly in a browser.

If you prefer a local server, you can also run:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/gym-wro-dashboard.html
```

## Intended Future Development

Planned next steps include:

- integrating real ESP32 or wearable sensor data,
- connecting live EMG and IMU streams,
- improving the accuracy of fatigue and rep-quality estimation,
- adding more detailed historical tracking,
- and refining the dashboard for real training use.

## Summary

Gym WRO is a concept for a wearable training feedback system that turns effort and movement into understandable, practical insights. The current dashboard shows the intended experience in a refined and approachable format while the underlying sensor logic is still being developed.
