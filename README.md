# Gym WRO — Wearable Rep Output & Near-Failure System
[Link to the project](https://samrat21-afk.github.io/Gymwro/)

> **Wearable Muscle Fatigue & Rep-Quality Sensor System for Resistance Training**
> *Innovation Challenge Project*

Gym WRO is a wearable sensor system designed for resistance training to measure proximity to muscular failure and evaluate rep quality in real time. Instead of relying solely on subjective feeling, Gym WRO combines **surface Electromyography (sEMG)** muscle activity signals with **6-DOF Inertial Measurement Unit (IMU)** movement kinematics to give lifters objective feedback on workout intensity and form breakdown.

---

## 📊 Market Research & Industry Analysis

### 1. Market Opportunity & Industry Trends

- **Global Fitness Wearables Market**: Exceeds **$65 Billion** and is projected to reach **$180+ Billion by 2030** (CAGR ~16%).
- **Strength & Hypertrophy Surge**: Resistance training is currently the fastest-growing workout category among Gen-Z and Millennials, with over **64% of active gym-goers** participating in weightlifting.
- **The Problem in Current Training Culture**: Muscle hypertrophy requires training sets sufficiently close to muscular failure (0–2 Reps in Reserve / RIR). Over **80% of lifters** judge failure purely by subjective feeling, leading to stopping sets 3–5 reps early or completing "junk reps" with momentum, swinging, and shortened Range of Motion (ROM).

### 2. Target User Segmentation

- **Primary Market (Core Customers)**:
  - *Beginner to Intermediate Lifters*: Want objective feedback on workout intensity without paying $50–$150/hr for a personal trainer.
  - *Hypertrophy & Bodybuilding Enthusiasts*: Focused on progressive overload, maximizing muscle stimulus, and eliminating junk volume.
- **Secondary Market**:
  - *Personal Trainers & Coaches*: Monitoring client effort and preventing form breakdown across client sessions.
  - *Physical Therapy & Rehab Clinics*: Tracking safe muscle activation recovery post-injury.

### 3. Competitor Matrix & Landscape

| Competitor Category                     | Examples                          | Primary Metrics Tracked              | Limitations & Gym WRO Advantage                                                                                                              |
| :-------------------------------------- | :-------------------------------- | :----------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- |
| **All-Day Biometric Wearables**   | WHOOP, Apple Watch, Garmin        | Heart rate, HRV, strain score, sleep | *Limitation*: Infers load from cardio/movement.**Gym WRO**: Directly measures target muscle electrical activation (sEMG).            |
| **Velocity-Based Training (VBT)** | Enode, Vitruve, Output Sports     | Bar velocity, peak power, force      | *Limitation*: Measures external bar output ($300–$1,000+).**Gym WRO**: Measures internal muscle fatigue + ROM at $149 target price. |
| **Smart Gyms & Camera Vision**    | Tonal, Tempo, Perch               | Camera form tracking, machine load   | *Limitation*: Fixed, non-portable, expensive ($1,500–$3,500+).**Gym WRO**: Portable arm wearable for free weights & cables.         |
| **Research EMG Systems**          | Delsys Trigno, SMK Muscle Tracker | Raw surface electromyography         | *Limitation*: Clinical/research grade ($10,000+).**Gym WRO**: Simple, consumer-friendly near-failure score.                          |

### 4. The Unmet Market Gap

Competitors answer: *"How fast did the bar move?"*, *"How many reps did I do?"*, *"How many calories did I burn?"*

**Gym WRO answers the lifter's practical questions:**

1. *"Was I actually close to muscular failure?"*
2. *"Were my last reps good reps, or did my form break down?"*
3. *"Did my range of motion decrease near the end of the set?"*

### 5. Unit Economics & Pricing Strategy

- **Prototype Build Cost**: **$75 – $120** (ESP32 + sEMG sensor + MPU6050 6-DOF IMU + 3D printed housing).
- **Target Retail Price**: **$149 – $249** (Positioned as an accessible, one-time purchase wearable alternative to expensive smart gyms or research EMG devices).

---

## ✨ System Features

- **Near-Failure Estimator**: Combines sEMG electrical activation amplitude with fatigue trend indices to estimate proximity to failure.
- **Biomechanical Kinematics**: Tracks concentric rep speed, velocity decay, and Range of Motion (ROM°) using accelerometer and gyroscope data.
- **Hardware & Software LED Alignment**: 4-color feedback system (*Green: Good Reps*, *Yellow: Fatigue Building*, *Orange: Near Failure*, *Red: Quality Breakdown*) mirrored on the hardware RGB LED and the dashboard arc gauge.
- **Web Serial Telemetry**: Directly connects to the ESP32 microcontroller over USB Serial (`115200` baud) via Web Serial API.
- **Interactive Demo Mode**: Built-in presentation simulator to test and demo hypertrophy sets without requiring physical hardware connected.
- **Raw CSV Data Export**: 1-click export of session telemetry timestamps, sEMG values, IMU coordinates, ROM, rep speed, fatigue scores, and athlete notes.

---

## 💻 Web Dashboard (`index.html`)

The dashboard is structured for GitHub Pages deployment using `index.html`, `gym-wro-dashboard.css`, and `gym-wro-dashboard.js`.

### Athlete Workflow (4 Steps):

1. **01 Connect**: Establish USB Serial stream with the ESP32 wearable or launch Demo Mode.
2. **02 Calibrate**: Select target exercise (*Biceps Curl*, *Barbell Squat*, *Bench Press*, *Shoulder Press*, *Lateral Raise*) and record a 3-rep warm-up baseline.
3. **03 Live Set**: View real-time rep count, rep speed (s), ROM (°), sEMG (µV), near-failure alert banner, and 3 Chart.js graphs (*sEMG*, *Motion*, *Quality Score*).
4. **04 Set Summary**: Inspect post-set analytics, read plain-language narrative reports, log athlete notes, and export raw CSV data.

---

## ⚡ Serial Data Stream Protocol (115200 Baud)

The ESP32 firmware streams line-delimited JSON payloads formatted as:

```json
{
  "time": 1.25,
  "emg": 642,
  "accelX": 0.12,
  "accelY": 0.85,
  "gyroZ": 14.2,
  "repCount": 5,
  "rom": 82,
  "repSpeed": 1.4,
  "fatigueScore": 62,
  "status": "Fatigue Building"
}
```

---

## 🛠️ Hardware Components

| Component                       | Function                                                            |
| :------------------------------ | :------------------------------------------------------------------ |
| **ESP32 Microcontroller** | System processing core & serial telemetry transmission              |
| **Surface EMG Module**    | Measures muscle electrical activation & mean power frequency shifts |
| **MPU6050 6-DOF IMU**     | Measures angular velocity, acceleration, concentric tempo & ROM     |
| **RGB LED Indicator**     | Real-time 4-stage visual effort indicator on the arm strap          |
| **Web Dashboard**         | Real-time console UI (`index.html`)                               |

---

## 🚀 Getting Started

1. Open [`index.html`](file:///Users/samratgharti/Library/CloudStorage/OneDrive-UniversityofCincinnati/Innovation_Challenge/All_files/index.html) in Google Chrome or Microsoft Edge.
2. Click **Connect via USB** (for ESP32 hardware) or **Start Demo Set** (for presentation testing).
3. Select your target exercise and run through the calibration and live set workflow.

---

## 👥 Innovation Challenge Team

- **Brando Vasquez** — Project Lead & Hardware Concept
- **Samrat Gharti** — Software Architecture & Dashboard Development
- **Mayumi Chinchihualpa** — Hardware Electronics & Mechanical Design
- **Pritam** — Research, Problem Definition & Pitch Presentation
