Frontend Contract
Purpose
This document defines the visual system, component rules, structure, and constraints for the frontend. It ensures the UI remains clean, consistent, and focused on the core experience.
The frontend must be:
simple
fast
readable
demo-ready
Not:
fancy
overdesigned
feature-heavy

Design Principles (NON-NEGOTIABLE)

1. Clarity > Creativity

User must understand app in <5 seconds
No decorative elements without purpose

1. One-screen experience

Everything visible without navigation
No multiple pages

1. Fast interaction

Click → result in seconds
No delays, no confusion

1. Structured hierarchy

Always in this order:
Buttons → Metrics → Chart → Issue → Explanation → Fixes

Color Scheme
Theme
Dark mode (clean, modern, easier on eyes)

Colors
Primary Background: #0B0F14
 Secondary Background: #111827
Primary Accent: #ED9B40
 Accent Hover: #F2A957
Surface / Card: #14342B
 Surface Alt: #1F2937
Primary Text: #E5E7EB
 Secondary Text: #9CA3AF
Border: #1F2937
Success: #22C55E
 Warning: #F59E0B
 Error: #EF4444

Typography Rules
No fancy fonts
Use system or default sans-serif
Headings slightly larger, not huge
Keep everything readable

Component Rules
Buttons
4 buttons only
Equal size
Clear labels:
Real App
Healthy API
High Latency API
Flow API
Behavior:
Disabled while loading
Hover effect (slight brightness)

Metrics Panel
Display as grid or stacked list
Bold numbers, smaller labels
Example:
320 ms
Avg Latency

Chart
Line chart only
No multiple datasets
No heavy styling

Issue Display (IMPORTANT)
Must be visually prominent
Example:
⚠️ Detected Issue: High Latency

Use color based on issue type

Explanation
Short paragraph
No long blocks of text

Fixes
Bullet list
Max 2 items

Strict Rules
❌ Do NOT add:
authentication
navigation
multiple pages
dashboards
filters
settings
forms beyond buttons

❌ Do NOT:
over-style
use gradients everywhere
add animations beyond minimal

❌ Do NOT:
compute anything in frontend
frontend = display only

State Management Rules
Use simple state (React state)
No Redux / complex state libs

Required states:
idle
loading
success
error

Folder Structure
frontend/
├── app/
│   └── page.tsx
├── components/
│   ├── ScenarioButtons.tsx
│   ├── MetricsPanel.tsx
│   ├── LatencyChart.tsx
│   ├── IssueBanner.tsx
│   ├── ExplanationPanel.tsx
│   └── FixesList.tsx
├── lib/
│   └── api.ts
├── styles/
│   └── globals.css

File Responsibilities
page.tsx
main layout
state management
orchestrates components

ScenarioButtons.tsx
renders buttons
triggers API calls

MetricsPanel.tsx
displays metrics only

LatencyChart.tsx
renders line chart
consumes latencies array

IssueBanner.tsx
displays detected issue
handles color coding

ExplanationPanel.tsx
shows AI explanation

FixesList.tsx
displays fixes

lib/api.ts
contains fetch logic for /run-test

API Usage Rules
Only call:
POST /run-test

No other endpoints
No transformation logic

UI Layout (Final)
[ Title ]

[ Scenario Buttons ]

[ Metrics ]

[ Chart ]

[ Detected Issue ]

[ Explanation ]

[ Fixes ]

Performance Rules
No unnecessary re-renders
No heavy computations
Chart must render instantly

Final Constraint
If a feature is not in this document → it does NOT get built

Conclusion  
The frontend is designed to:  
clearly communicate results  
feel like a real tool  
stay minimal and focused  
This ensures:  
fast development  
clean demo  
strong judge impression