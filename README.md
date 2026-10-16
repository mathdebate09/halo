# Halo

<p align="center">
 <img src="halo-app/assets/images/icon.png" alt="Halo" width="160" style="border-radius: 24px;" />
</p>

<p align="center">
 <a href="https://github.com/mathdebate09/halo/releases/download/v1.0.0/halo-v1.0.0-arm64-v8a.apk">
  <img src="https://ik.imagekit.io/jayowiee/badges/download-apk.png" alt="download APK" height="48" />
 </a>
 <a href="https://github.com/mathdebate09/halo/releases/latest" style="margin-left: 10px;">
  <img src="https://ik.imagekit.io/jayowiee/badges/latest-release.png" alt="latest release" height="48" />
 </a>
 <a href="https://youtu.be/zd7-yfEnYnQ" style="margin-left: 10px;">
  <img src="https://ik.imagekit.io/jayowiee/badges/demo.png" alt="youtube demo video" height="48" />
 </a>
</p>

<p align="center">
 A personal health assistant for Android that tells you the one thing to do next, written in Expo &amp; NestJS
</p>

<p align="center">
 Android 8+ (arm64) · <a href="#screenshots">Screenshots</a> · <a href="ARCHITECTURE.md">Architecture</a>
</p>

## Core features

1. **Effortless capture:** a meal photo, a spoken note, one-tap water, a weight ruler.
2. **One goal, with a clear what and why:** onboarding ends in a target and a date. Today says what to do next, and Learn more says why.
3. **Lab reports tied to that goal:** a PDF becomes Vitals readings and one step to take, not a list of flags.
4. **An assistant that does the work:** Halo picks what's worth saying and when, acts in one tap, and checks the next morning whether it worked. The Advisor answers when you ask.

**Left out on purpose:**
- Login and a profile screen: the phone is the store, and progress lives on Today.
- Workout tracking: fitness comes from Health Connect.
- Seeded demo data and iOS.

## Screenshots

### Onboarding

<table>
  <tr>
    <td align="center" width="25%"><img src="docs/screenshots/onboarding/01-intro.webp" alt="Intro" width="200" /><br /><sub>Intro</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/onboarding/02-health-connect.webp" alt="Health Connect" width="200" /><br /><sub>Health Connect</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/onboarding/03-meal-logger.webp" alt="What logging looks like" width="200" /><br /><sub>What logging looks like</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/onboarding/04-interests.webp" alt="What matters to you" width="200" /><br /><sub>What matters to you</sub></td>
  </tr>
  <tr>
    <td align="center" width="25%"><img src="docs/screenshots/onboarding/05-birthday.webp" alt="Birthday wheel" width="200" /><br /><sub>Birthday wheel</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/onboarding/06-height.webp" alt="Height ruler" width="200" /><br /><sub>Height ruler</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/onboarding/07-weight.webp" alt="Weight ruler" width="200" /><br /><sub>Weight ruler</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/onboarding/08-pace.webp" alt="Pace" width="200" /><br /><sub>Pace</sub></td>
  </tr>
  <tr>
    <td align="center" width="25%"><img src="docs/screenshots/onboarding/09-daily-target.webp" alt="Daily target" width="200" /><br /><sub>Daily target</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/onboarding/10-plan-ready.webp" alt="Plan ready" width="200" /><br /><sub>Plan ready</sub></td>
  </tr>
</table>

### Today

<table>
  <tr>
    <td align="center" width="25%"><img src="docs/screenshots/today/01-empty-day.webp" alt="A day with nothing logged" width="200" /><br /><sub>A day with nothing logged</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/today/02-today.webp" alt="After a meal and a report" width="200" /><br /><sub>After a meal and a report</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/today/03-learn-more.webp" alt="Learn more: summary + meal score" width="200" /><br /><sub>Learn more: summary + meal score</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/today/04-water.webp" alt="Water against the clock" width="200" /><br /><sub>Water against the clock</sub></td>
  </tr>
</table>

### Logging

<table>
  <tr>
    <td align="center" width="25%"><img src="docs/screenshots/logging/01-logger.webp" alt="Meal Logger" width="200" /><br /><sub>Meal Logger</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/logging/02-meal-result.webp" alt="Estimated meal, Log or Reject" width="200" /><br /><sub>Estimated meal, Log or Reject</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/logging/03-weigh-in.webp" alt="Weigh-in sheet" width="200" /><br /><sub>Weigh-in sheet</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/logging/04-history.webp" alt="History" width="200" /><br /><sub>History</sub></td>
  </tr>
</table>

### Exercise

<table>
  <tr>
    <td align="center" width="25%"><img src="docs/screenshots/exercise/01-exercise.webp" alt="The climb" width="200" /><br /><sub>The climb</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/exercise/02-activity-analysis.webp" alt="Activity Analysis" width="200" /><br /><sub>Activity Analysis</sub></td>
  </tr>
</table>

### Vitals and lab reports

<table>
  <tr>
    <td align="center" width="25%"><img src="docs/screenshots/vitals/01-vitals.webp" alt="Vitals hero" width="200" /><br /><sub>Vitals hero</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/vitals/02-vitals-detail.webp" alt="Areas with sources" width="200" /><br /><sub>Areas with sources</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/vitals/03-report-password.webp" alt="Locked PDF" width="200" /><br /><sub>Locked PDF</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/vitals/04-report-reading.webp" alt="Reading the report" width="200" /><br /><sub>Reading the report</sub></td>
  </tr>
  <tr>
    <td align="center" width="25%"><img src="docs/screenshots/vitals/05-blood-work.webp" alt="Blood work" width="200" /><br /><sub>Blood work</sub></td>
  </tr>
</table>

### Advisor

<table>
  <tr>
    <td align="center" width="25%"><img src="docs/screenshots/advisor/01-advisor.webp" alt="Suggested question" width="200" /><br /><sub>Suggested question</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/advisor/02-thinking.webp" alt="Checking today's meals" width="200" /><br /><sub>Checking today's meals</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/advisor/03-answer-card.webp" alt="Answer + water card" width="200" /><br /><sub>Answer + water card</sub></td>
  </tr>
</table>

### Share

<table>
  <tr>
    <td align="center" width="25%"><img src="docs/screenshots/share/01-backgrounds.webp" alt="Backgrounds" width="200" /><br /><sub>Backgrounds</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/share/02-presets.webp" alt="Presets" width="200" /><br /><sub>Presets</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/share/03-card.webp" alt="The card" width="200" /><br /><sub>The card</sub></td>
  </tr>
</table>

### Dark mode

<table>
  <tr>
    <td align="center" width="25%"><img src="docs/screenshots/dark/01-today.webp" alt="Today" width="200" /><br /><sub>Today</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/dark/02-learn-more.webp" alt="Learn more" width="200" /><br /><sub>Learn more</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/dark/03-vitals.webp" alt="Vitals" width="200" /><br /><sub>Vitals</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/dark/04-vitals-detail.webp" alt="Vitals detail" width="200" /><br /><sub>Vitals detail</sub></td>
  </tr>
</table>

## A day with Halo

| When | What Halo does | What you do |
|---|---|---|
| Wake-up + 15 min | "Weigh in before breakfast": a notification timed to *your* wake time | Tap it, roll the ruler |
| Before lunch | Learns your usual lunch time (rolling median of your logs), nudges 15 min before | Photograph the plate |
| 5 pm | Pace check: "About 30 g protein to go" | Nothing, or log a snack |
| Evening | Bedtime nudge worked back from your wake time and sleep need | Go to bed |
| Next morning | "You closed the protein gap yesterday" | Read one line |

At most six a day, 90 minutes apart, never in quiet hours. A nudge ignored three times stops.

## System overview

```mermaid
flowchart LR
  subgraph Phone["Android phone"]
    UI["Screens<br/>(Expo Router)"]
    Store[("SQLite + MMKV<br/>source of truth")]
    Engine["halo-shared<br/>plan · scores · PA engine"]
    Outbox["Outbox +<br/>sync worker"]
    Native["Local modules<br/>PDF · speech · screen time"]
    HC["Health Connect"]
    Notif["Scheduled<br/>notifications"]
  end
  subgraph Heroku["Heroku (Basic dyno)"]
    API["NestJS API<br/>x-app-key + x-device-id"]
    Jobs["In-process jobs"]
  end
  Atlas[("MongoDB Atlas")]
  DS["DeepSeek<br/>(flash model)"]

  UI <--> Store
  Engine --> UI
  Store --> Engine
  HC --> Store
  Native --> UI
  Engine --> Notif
  Store --> Outbox
  Outbox <-->|"push / pull"| API
  UI -->|"photos, report pages,<br/>Advisor turns"| API
  API --> Jobs
  API <--> Atlas
  Jobs <--> Atlas
  API --> DS
  Jobs --> DS
```

The UI reads only from the phone. Plans, scores and briefs are computed there by `halo-shared`. The backend syncs records and runs the AI calls. More in [ARCHITECTURE.md](ARCHITECTURE.md).
