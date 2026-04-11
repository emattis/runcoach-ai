# Injury Risk Assessment Prompt

## Scoring Factors

The AI assesses injury risk (0-100) based on:

- **Acute-to-chronic workload ratio (ACWR)** — Flag if >1.3
- **Subjective soreness trends** — Rising trend = concern
- **Sleep quality trends** — Declining trend = concern
- **Mileage ramp rate** — >10% increase = elevated risk
- **Missed/modified workouts** — Pattern of backing off = red flag
- **Historical pattern** — This athlete gets hurt combining mileage ramps with intensity

## Thresholds

- **Risk > 70**: Auto-suggest reduced volume. Coach warns athlete directly.
- **Risk > 85**: Auto-prescribe recovery week regardless of plan.
