# FYP_SLIDE - project proposal slides

The slides for the project proposal (for the ORIC registration): **9 slides**, with an animated "shared pool" story.

| File | What it is |
|---|---|
| `FYP_Proposal.pptx` | The deck. Open it in PowerPoint 2019 / Microsoft 365 (the animation needs the **Morph** transition) |
| `FYP_Proposal.pdf` | The same slides as a still PDF (no animation), for uploads |
| `previews/slide1.png` ... `slide9.png` | One picture of each slide |
| `build_slides.js` | The script that builds the deck (change the text or the numbers here, then rebuild) |
| `scripts/export_previews.ps1` | Writes the previews and the PDF with PowerPoint |
| `scripts/apply_theme.js` | Helper used by the build (writes the colours and fonts into the deck's theme) |

## The 9 slides

1. Title: project, team, supervisors
2. Problem statement (idle staff, labour cost, fixed teams, no live visibility) with a picture of "organization A idle, organization B short"
3. Goals and objectives
4. Our solution: the five roles, six building blocks, what is new, technologies
5. Shared pool, 8:30 AM: 10 trained people, 5 organizations, empty places shown in grey
6. 9 AM - 2 PM: the AI autopilot sends people (Bus 2, University 2, Restaurant 1, Clinic 2, School 2)
7. 2 PM: University and School return one person each; the restaurant rush gets all 3 free people
8. 3 PM - 5 PM: the rush is over, people return and are re-assigned
9. 5 PM: everybody is back in the pool (10 people served 5 organizations all day)

## The animation

Slides 6 to 9 use PowerPoint's **Morph** transition. Every person is one picture with a fixed name (`!!p1` ... `!!p10`) that sits in the pool or inside an
organization on each slide, so when you click to the next slide the people slide from the pool to the organizations (and back) on their own.
Click once per slide in the slide show (F5). Slides 2 to 5 fade in. If you edit the deck by hand, keep the `!!` names (Selection Pane: Home > Select > Selection Pane).

## Change something and rebuild

```
cd FYP_SLIDE
npm install          (once)
node build_slides.js
powershell -ExecutionPolicy Bypass -File scripts/export_previews.ps1     (previews + PDF, needs PowerPoint)
```

Colours and fonts are at the top of `build_slides.js` (navy, orange people, soft white background, Calibri). Speaker notes are in each slide's notes.
