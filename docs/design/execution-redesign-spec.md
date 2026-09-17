# Execution tab: the Horizon in RunFree's colours (brand-forward, with grafts)

The Execution tab is the one place in the portal where a church looks at distance: 5–20 years at the top of the sheet, 90 days at the bottom. The meeting happens at the bottom. The board becomes a literal horizon:
- The Beyond statement is set large in Montserrat navy on a faint sky wash.
- A single 3px runfree-sunset line (the board's only gradient) marks the horizon.
- The rail keeps its far-to-near ramp and darkens into the Foreground, where four lifted white initiative cards sit on the only tinted ground, with a real "You are here" pin.

This Week becomes the portal's own navy dark card: gradient top bar, the largest number on the page, and the agenda header in one row. It stops melting into the navyDeep sidebar.

Everything else gets quieter:
- Five uppercase voices shrink to two.
- Every light becomes one rounded mosaic tile, shared by the status mark, StepStrip, TrendStrip and MeasureMosaic. That gives one God Dreams progress language, and it always travels with its word ("On track", "At risk") so it can be read across a room on a TV.
- Viewers see a single lit tile, never a wall of hollow circles.
- Dates read as plain text until clicked.
- The Measures chart sits under the columns it plots.
- Renewal becomes a timeline.
- The detail loses one nesting level.

Taken from the judges:
- From calm-ops: the status word, the quiet RagPicker, the Select wrapper, and the This Week header row.
- From typeset: restraint (one Label voice, a single lit dot for viewers, a DateCell that shows text at rest, and no strikethrough).
- From the church-leader judge: the amber number disc for stale initiatives.

Rejected:
- Calm-ops' xl side drawer. It breaks "detail opens under the clicked band", and with auto-sized rows plus row-span-4 it stretches the bands apart.
- Brand-forward's staggered animate-rise. `animation: … both` pins `transform` and cancels the hover lift, and a sheet read in a meeting should not animate in.

Data, write gates, meeting order and every signal stay exactly as they are. lib/execution.ts is not touched.

## Primitives (ui.tsx first)

All of these go in src/components/execution/ui.tsx. That file stays the single home for shared primitives, and there is no second traffic light anywhere. Import RAG_DOT and RAG_LABEL (plus the RagStatus type) from lib/execution. lib/execution.ts is not edited.

1. STATUS_TEXT. A local map so a status can be typeset as a word without touching lib:
   `export const STATUS_TEXT: Record<RagStatus,string> = { green:'text-emerald-800', amber:'text-amber-800', red:'text-rose-700' };`

2. PINK_BUTTON. The portal's pink CTA, shared as a class constant:
   `export const PINK_BUTTON = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-runfree-pink px-3.5 py-2 text-xs font-bold text-runfree-magentaDeep transition-colors hover:bg-runfree-magenta hover:text-white disabled:opacity-50';`

3. Icon. `export type IconName = 'telescope'|'flag'|'target'|'footprints'|'pin'|'user'|'users'|'calendar'|'check'|'check-square'|'message'|'book'|'chart'|'clipboard'|'chevron-down'|'x'|'plus';`
   `export function Icon({name,className=''}:{name:IconName;className?:string})` returns:
   `<svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>{ICON_PATHS[name]}</svg>`
   ICON_PATHS is a Record of JSX fragments built from simple geometry, stroke only:
   - telescope: `<path d="M3 13l12-6 2 4-12 6z"/><path d="M15 7l3-1.5 2 4-3 1.5"/><path d="M9 16l-3 5M11 15l3 6"/>`
   - flag: `<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>`
   - target: `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>`
   - footprints: `<path d="M7 3c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5z"/><path d="M5 16h4v2a2 2 0 0 1-4 0z"/><path d="M17 7c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5z"/><path d="M15 20h4v1"/>`
   - pin: `<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>`
   - user: `<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>`
   - users: `<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 13.5a7 7 0 0 1 4 6.5"/>`
   - calendar: `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>`
   - check: `<path d="M5 12l5 5 9-10"/>`
   - check-square: `<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12l3 3 5-6"/>`
   - message: `<path d="M4 5h16v11H9l-5 4z"/>`
   - book: `<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>`
   - chart: `<path d="M4 20V4M4 20h16"/><path d="M8 15l4-4 3 3 5-6"/>`
   - clipboard: `<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/>`
   - chevron-down: `<path d="M6 9l6 6 6-6"/>`
   - x: `<path d="M6 6l12 12M18 6L6 18"/>`
   - plus: `<path d="M12 5v14M5 12h14"/>`
   The existing PDF glyph in HorizonBoard may move to `book`.

4. StatusMark. The single light shape, a rounded mosaic tile.
   `export function StatusMark({status,size='md',className='',labelHidden=false}:{status:RagStatus;size?:'sm'|'md'|'lg';className?:string;labelHidden?:boolean})`
   - Size classes: `const s={sm:'h-2.5 w-2.5 rounded-[3px]',md:'h-3.5 w-3.5 rounded-[4px]',lg:'h-[18px] w-[18px] rounded-[5px]'}[size];`
   - Returns: `<span className={`inline-flex shrink-0 items-center ${className}`}><span aria-hidden className={`${s} block ${RAG_DOT[status]} shadow-[inset_0_-2px_0_rgba(0,0,0,.14)]`}/>{!labelHidden && <span className="sr-only">{RAG_LABEL[status]}</span>}</span>`

5. StatusWord. The graft from calm-ops and typeset: the light's word, visible, so status is never colour-only on a TV.
   `export function StatusWord({status,size='sm'}:{status:RagStatus;size?:'xs'|'sm'})` returns:
   `<span className={`${size==='xs'?'text-xs':'text-sm'} font-semibold ${STATUS_TEXT[status]}`}>{RAG_LABEL[status]}</span>`
   Use it next to a StatusMark that has `labelHidden`.

6. NumberDisc. Replaces the gray-300 OBJECTIVE N / INITIATIVE N labels.
   `export function NumberDisc({n,tone='navy'}:{n:number;tone?:'navy'|'amber'})` returns:
   `<span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums ${tone==='amber'?'bg-amber-100 text-amber-900':'bg-runfree-indigo text-runfree-navy'}`}>{n}</span>`
   Callers add the sr-only "Objective n." / "Initiative n." text. The amber tone for stale initiatives is the church-leader graft; staleness is also carried by the "Nd since check-in" words.

7. SubHeading. Replaces every navy tracked-caps h4 in the detail views.
   `export function SubHeading({icon,children,count,aside,as='h4'}:{icon:IconName;children:React.ReactNode;count?:number;aside?:React.ReactNode;as?:'h4'|'span'})`
   Let `const T = as;`. Returns:
   `<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><T className="flex items-center gap-2 font-display text-sm font-extrabold tracking-tight text-runfree-ink"><span aria-hidden className="grid h-6 w-6 place-items-center rounded-md bg-runfree-indigo text-runfree-navy"><Icon name={icon} className="h-3.5 w-3.5"/></span>{children}{count!=null && <span className="font-sans text-xs font-semibold tabular-nums text-gray-500">{count}</span>}</T>{aside}</div>`
   When `as='span'` (inside a button), the wrapper must also be a span. Use `const W = as==='span' ? 'span' : 'div'` with `className` plus `flex`.

8. Label. The ONE small field/column voice, the typeset graft.
   `export function Label({children,className=''}:{children:React.ReactNode;className?:string})` returns:
   `<span className={`block text-[10px] font-semibold uppercase tracking-wide text-gray-500 ${className}`}>{children}</span>`
   A caller's colour class overrides the grey (for example the rail's `text-white/75`). Use tailwind-merge if the repo has it; otherwise pass `className` and accept Tailwind order. To be safe, add a `tone` prop, `tone?: string`, that replaces `text-gray-500` when given.
   The only uppercase voices left on the tab are this one and the magentaDeep `tracking-[0.16em]` section eyebrow (BlockHeading, DetailShell, This Week's pink eyebrow). This Week's stat labels and the Renewal year chip are the two sanctioned exceptions on a tinted ground.

9. Field / MiniField. Labels move from gray-400 to gray-500:
   - Field: `block text-[11px] font-semibold uppercase tracking-wide text-gray-500`
   - MiniField: `text-[10px] font-semibold uppercase tracking-wide text-gray-500`
   The markup is otherwise unchanged; StepRow stops using MiniField.

10. BlockHeading. Add `action?: React.ReactNode`. Wrap the existing block as:
    `<div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div className="min-w-0">…existing eyebrow/h3/note, classes unchanged…</div>{action}</div>`

11. Select. The graft from calm-ops; it kills the OS chevron.
    `export function Select({className='',size='sm',...props}:React.SelectHTMLAttributes<HTMLSelectElement>&{size?:'xs'|'sm'})` returns:
    `<span className="relative inline-block min-w-0 max-w-full"><select {...props} className={`w-full appearance-none rounded-md border border-transparent bg-transparent py-1 pl-1.5 pr-6 ${size==='xs'?'text-xs':'text-sm'} text-runfree-ink transition hover:border-gray-200 focus:border-runfree-magenta focus:bg-white disabled:cursor-default disabled:hover:border-transparent ${className}`}/><Icon name="chevron-down" className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400"/></span>`
    Omit the Icon when `props.disabled`.
    `size` conflicts with the native `size` attribute. Name the prop `tone` or `dense` instead: `dense?: boolean` sets text-xs. Update the StepRow sketch accordingly (`<Select dense …>`).

12. RagPicker (lines 48-109). Keep the radiogroup role, the single roving tab stop, arrow/Home/End, the 28px `grid h-7 w-7 place-items-center rounded-full` targets, and the existing props. Add `quiet?: boolean`.
    - The chosen option renders `<StatusMark status={v} size="md" labelHidden/>`. The button already carries aria-checked, and its aria-label stays RAG_LABEL.
    - Unchosen options render `<span className={`block h-3 w-3 rounded-[3px] bg-white ring-1 ring-gray-300 transition-opacity ${quiet ? 'opacity-40 group-hover/rag:opacity-100 group-focus-within/rag:opacity-100 [@media(pointer:coarse)]:opacity-100' : ''}`}/>`.
    - The radiogroup wrapper gets `group/rag inline-flex items-center`.
    - Callers: StepRow and MetricRow pass `quiet`. CheckIn does not.
    - `disabled` (viewers, the typeset graft): return only `<span role="img" aria-label={RAG_LABEL[value]} className="grid h-7 w-7 place-items-center"><StatusMark status={value} size="md" labelHidden/></span>`, with no radiogroup and no hollow options. The width change is acceptable because viewer rows have no Remove/× beside it.
    - The same component and file serve every caller. On initiatives there is still NO RagPicker; status changes only through a check-in.

13. DateCell (lines 214-239). Adopt Cell's pattern of showing text at rest (the typeset graft).
    - `const [editing,setEditing]=useState(false)`.
    - Disabled: the existing read-only span showing prettyDate(value) or a gray-300 dash (unchanged).
    - At rest: `<button type="button" aria-label={`${label ?? 'Date'}: ${value ? prettyDate(value) : 'not set'}. Edit`} onClick={()=>setEditing(true)} className="flex w-full min-w-0 items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1 text-left text-sm tabular-nums text-runfree-ink transition hover:border-gray-200">{value ? prettyDate(value) : <span className="text-gray-300">—</span>}</button>`
      Add a `label?: string` prop and pass "Start date" / "Next review".
    - Editing: `<input type="date" autoFocus defaultValue={value ?? ''} onChange={save} onBlur={(e)=>{save(e);setEditing(false)}} onKeyDown={(e)=>{if(e.key==='Escape'){setEditing(false)}}} className="w-full rounded-md border border-runfree-magenta bg-white px-1.5 py-1 text-sm text-runfree-ink outline-none"/>`
    - In a `useEffect` on mount while editing: `try { (ref.current as any)?.showPicker?.() } catch {}`. Safari < 16 lacks showPicker, so the fallback is simply the focused input and the date stays editable.
    - The save/equality logic is unchanged from today's DateCell.
    - After Escape or blur, return focus to the rest button (keep a ref and focus it in the effect when `editing` flips to false).

14. Cell, Chip, EditorActions, prettyDate, isDateish, todayIso: unchanged.

## Build spec

Files touched (10): src/components/execution/ui.tsx, src/components/execution/HorizonBoard.tsx, src/components/ExecutionPanel.tsx, src/components/execution/InitiativeDetail.tsx, src/components/execution/MidgroundDetail.tsx, src/components/execution/BackgroundDetail.tsx, src/components/execution/BeyondDetail.tsx, src/components/execution/MinistryDashboard.tsx, src/components/execution/MeasureMosaic.tsx, src/components/execution/RenewalCycle.tsx.
Not touched: src/lib/execution.ts, src/app/globals.css, tailwind.config.ts, src/app/projects/[id]/page.tsx.

Work in this order. After each step, run `tsc --noEmit` before moving on.

==================================================================
STEP 1 — ui.tsx primitives (full detail in `primitives`)
==================================================================
Add:
- STATUS_TEXT
- Icon
- StatusMark
- StatusWord
- NumberDisc
- SubHeading
- Label
- Select
- PinkButton class constant

Change:
- RagPicker: quiet rest state, and a single tile when disabled.
- DateCell: text at rest, native input on click.
- Field and MiniField labels move to gray-500.
- BlockHeading gains an `action` slot.

HorizonBoard's TrendStrip and StepStrip change shape in step 2. They stay exported from HorizonBoard.tsx; do not move them.

==================================================================
STEP 2 — HorizonBoard.tsx
==================================================================
2a. BANDS (lines 88-133). Replace the fields `rail/text/faint` with `rail/text/faint/icon/ground`. Add a comment above the array: "Rail ramp literals, far→near, tuned by eye; the only non-token colours on the board besides the MeasureMosaic palette."

  beyond:     icon 'telescope',  rail 'bg-gradient-to-r sm:bg-gradient-to-b from-[#F4F6FC] to-[#E4E9F8]', text 'text-runfree-navy', faint 'text-runfree-navy/70', ground 'bg-gradient-to-b from-[#EEF1FA] to-white'
  background: icon 'flag',       rail 'bg-gradient-to-r sm:bg-gradient-to-b from-[#D3DBF3] to-[#BFC9EC]', text 'text-runfree-navy', faint 'text-runfree-navy/70', ground 'bg-white'
  midground:  icon 'target',     rail 'bg-gradient-to-r sm:bg-gradient-to-b from-[#4A63B8] to-[#2F4699]', text 'text-white', faint 'text-white/75', ground 'bg-white'
  foreground: icon 'footprints', rail 'bg-gradient-to-r sm:bg-gradient-to-b from-[#1E2C63] to-runfree-navyDeep', text 'text-white', faint 'text-white/70', ground 'bg-[#E4E9F8]'

Graft from the product-designer judge: the Foreground is the ONLY tinted body ground. Mid-Ground stays white. The Beyond sky wash is a fade to white, not a second tint.

2b. Outer shell (HorizonBoard 135-374):
  `<div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-gray-200">`
Each band:
  `<section className={i>0 ? 'border-t border-gray-200' : ''}><div className="grid sm:grid-cols-[10rem_minmax(0,1fr)]">`

Rail cell:
  `<div className={`flex flex-row flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:flex-col sm:items-start sm:gap-x-0 sm:py-5 ${band.rail}`}>`
  - `<Icon name={band.icon} className={`h-[18px] w-[18px] ${band.faint}`}/>`
  - `<p className={`font-display text-sm font-extrabold leading-tight tracking-tight sm:mt-2 ${band.text}`}>{band.label}</p>`
  - `<Label className={`sm:mt-1 ${band.faint}`}>{band.span}</Label>` (Label accepts a colour override; see primitives)
  - `<p className={`text-[11px] sm:mt-3 ${band.faint}`}>{band.sub}</p>`
  - Foreground only:
    `<p className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-runfree-orangeLight sm:ml-0 sm:mt-auto sm:pt-4"><span className="grid h-6 w-6 place-items-center rounded-full bg-runfree-orangeLight/20 ring-4 ring-runfree-orangeLight/10"><Icon name="pin" className="h-3.5 w-3.5"/></span>You are here</p>`
    There is no pulse animation.

Body:
  `<div className={`min-w-0 ${band.ground}`}>…</div>`

After the Beyond band's grid, before its detail slot:
  `<div aria-hidden className="h-[3px] bg-runfree-sunset"/>`

Detail slot: keep the existing condition and `id="execution-detail"`:
  `<div id="execution-detail" className="border-t border-gray-200 bg-gray-50">{detail}</div>`
Band bodies must NOT get overflow-hidden, because the caret hangs 7px.
scrollIntoView stays in ExecutionPanel line 162, unchanged.

2c. Grid (422-428):
  `function Grid({cols,children}){ return <div className={`grid gap-3 p-3 sm:p-4 ${cols===4?'sm:grid-cols-2 xl:grid-cols-4':''}`}>{children}</div> }`
This deletes `gap-px bg-gray-200`. Both 4-grids still pad to four cells. The Foreground still shows four slots.

2d. Box (430-472), for Background objectives and the Mid-Ground goal:
```
<button type="button" aria-pressed={selected} onClick className={`group relative block w-full rounded-2xl bg-white p-4 text-left ring-1 transition-[box-shadow,--tw-ring-color] duration-200 ${selected ? 'ring-2 ring-runfree-magenta shadow-lg' : 'ring-gray-200 hover:ring-runfree-magenta/40 hover:shadow-md'}`}>
  {selected && <span aria-hidden className="absolute -bottom-[7px] left-6 h-3 w-3 rotate-45 border-b-2 border-r-2 border-runfree-magenta bg-white"/>}
  <span className="flex items-center justify-between gap-2">{n!=null && <NumberDisc n={n}/>}<span className="sr-only">Objective {n}. </span>{footer && <span className="text-[11px] font-semibold text-gray-500">{footer}</span>}</span>
  {title && <span className="mt-2.5 block font-display text-sm font-bold leading-snug text-runfree-ink">{title}</span>}
  <span className={`mt-1 block text-sm leading-snug ${empty ? 'text-gray-500' : 'text-gray-600 line-clamp-3'}`}>{empty ? placeholder : text}</span>
</button>
```
- Background boxes do not lift and have no shadow at rest (depth encodes distance).
- The footer is "N of 3 notes" (text unchanged).
- Empty objective: `rounded-2xl border border-dashed border-gray-300 bg-white/60 p-4 text-left text-sm text-gray-500 hover:border-runfree-magenta/50 hover:text-runfree-magentaDeep`, with NumberDisc and the EXISTING editor/viewer copy split. The copy is not italic.
- The Mid-Ground box uses the same shell plus `shadow-sm`:
  - Statement: `font-display text-base font-bold leading-snug text-runfree-ink`.
  - Mosaic footer: `<span className="mt-3 grid gap-x-6 gap-y-3 border-t border-gray-100 pt-3 sm:grid-cols-2">`, still up to 4 compact MeasureMosaic.
  - It has no NumberDisc.

2e. BeyondText (382-414) and the Vision templates column:
- Wrapper: `<div className={`grid ${showAside ? 'lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]' : ''}`}>`
- showAside = `chosen.length>0 || !!pdf || canEdit`. Viewers with nothing chosen and no PDF get no aside, and the statement spans full width. No "Not chosen yet." / "The full vivid description is coming." sentences on the board.
- Statement button:
  `<button type="button" aria-pressed={selected} className={`group block w-full px-5 py-5 text-left transition-colors sm:px-6 ${selected ? 'bg-runfree-pink/50 shadow-[inset_3px_0_0_#E43D96]' : 'hover:bg-runfree-indigo/40'}`}>`
  - Text: `<span className="block font-display text-lg font-extrabold leading-snug tracking-tight text-runfree-navy sm:text-[22px]">`. Keep the existing full vivid description text; no line-clamp.
  - Editors only: `<span className="mt-2 block text-[11px] font-semibold text-runfree-magentaDeep opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100">Edit the vision →</span>`
- Aside: `<aside className="border-t border-gray-200/70 px-5 py-5 sm:px-6 lg:border-l lg:border-t-0">`
  - Heading: `<Label>Vision templates</Label>`
  - List: `<ul className="mt-2 flex flex-wrap gap-4">`
  - Each item: `<li className="flex items-center gap-2.5"><img className="h-10 w-10 rounded-xl"/><span><span className="block text-sm font-bold leading-snug text-runfree-ink">{name}</span><span className="block text-[11px] text-gray-500">{group} · template {n}</span></span></li>`
  - When a PDF exists: `<a|button className={`${PINK_BUTTON} mt-3`}><Icon name="book" className="h-3.5 w-3.5"/>The full vivid description</…>`
  - Editors with nothing chosen: `<button className="mt-2 w-full rounded-2xl border border-dashed border-gray-300 px-3 py-3 text-left text-xs font-semibold text-gray-500 hover:border-runfree-magenta/50 hover:text-runfree-magentaDeep">Choose two templates · attach the PDF →</button>`. It opens the Beyond selection.

2f. InitiativeBox (481-577):
```
<button type="button" aria-pressed={selected} className={`group relative flex h-full w-full flex-col rounded-2xl bg-white p-4 text-left shadow-md ring-1 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:hover:translate-y-0 ${selected ? 'ring-2 ring-runfree-magenta shadow-lg' : 'ring-gray-200 hover:ring-runfree-magenta/40'}`}>
  {selected && <span aria-hidden className="absolute -bottom-[7px] left-6 h-3 w-3 rotate-45 border-b-2 border-r-2 border-runfree-magenta bg-white"/>}
  <span className="flex items-center justify-between gap-2">
    <NumberDisc n={n} tone={stale ? 'amber' : 'navy'}/><span className="sr-only">Initiative {n}. </span>
    <span className="flex items-center gap-1.5">
      {overdueReview && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">Review due</span>}
      {daysLeft!=null && <span className={`whitespace-nowrap text-[11px] font-semibold tabular-nums ${daysLeft<0 ? 'text-rose-700' : daysLeft<=14 ? 'text-amber-700' : 'text-gray-500'}`}>{daysLeft<0 ? `${-daysLeft}d over` : `${daysLeft}d left`}</span>}
    </span>
  </span>
  <span className="mt-3 flex items-start gap-2"><StatusMark status={status} size="md" className="mt-[3px]"/><span className="min-w-0 flex-1 font-display text-[15px] font-extrabold leading-snug text-runfree-ink">{i.name}</span></span>
  <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500"><StatusWord status={status} size="xs"/><span aria-hidden>·</span><span>{leader || 'No owner yet'} · {kind.label}</span><TrendStrip updates={trend}/></span>
  {pace?.behind && <span className="mt-1 block text-xs font-semibold text-amber-700">{existing behind-pace sentence}</span>}
  <span className="mt-auto block w-full pt-4"><StepStrip steps={steps}/><span className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 text-xs"><span className="text-gray-500">{existing 'N of M steps open'}</span><span className={`whitespace-nowrap ${stale ? 'font-semibold text-amber-700' : 'text-gray-500'}`}>{existing 'Nd since check-in'}</span></span></span>
</button>
```
- Signal logic is unchanged: reviewDue beats the 14-day stale rule, TrendStrip shows only with ≥2 check-ins, and the pace trigger is unchanged.
- The status word is the church-leader judge's graft, so the light can be read at TV distance. StatusMark keeps its sr-only label, and StatusWord makes that visible, so give StatusMark `labelHidden` here to avoid a double announcement.
- Empty slot, editors: `<button className="group flex h-full min-h-[9rem] w-full flex-col rounded-2xl border border-dashed border-gray-300 bg-white/50 p-4 text-left transition-colors hover:border-runfree-magenta/50"><NumberDisc n={n}/><span className="mt-3 text-sm font-semibold text-gray-500 group-hover:text-runfree-magentaDeep">+ Add the {ordinal} initiative</span></button>`. It keeps its existing onClick.
- Empty slot, viewers: the same shell as a `<div>` with the text "Not yet chosen" in text-gray-500.
- No animate-rise on any card.

2g. TrendStrip (591-608):
  `<span className="flex items-center gap-[3px]" title={existing}>{updates.map((u,idx)=><span key aria-hidden className={`block rounded-[2px] ${RAG_DOT[u.status]} ${idx===updates.length-1 ? 'h-2.5 w-2.5' : 'h-1.5 w-1.5 opacity-60'}`}/>)}<span className="sr-only">{existing history sentence}</span></span>`
  The ≥2 rule and the order are unchanged.

2h. StepStrip (614-625):
  `<span aria-hidden className={`flex h-1.5 w-full gap-[3px] ${className}`}>{steps.map(s=><span key className={`block h-full flex-1 rounded-[2px] transition-colors duration-500 ${RAG_DOT[s.status]}`}/>)}</span>`
  Empty state: `block h-1.5 w-full rounded-[2px] bg-runfree-indigo`.
  No ratio and no percent.

==================================================================
STEP 3 — detail views
==================================================================
3a. ExecutionPanel.tsx DetailShell (390-438):
- Delete the `absolute inset-y-0 left-0 w-1 bg-runfree-grad` rule.
```
<section className="animate-fade">
  <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-4 sm:px-7">
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-magentaDeep"><Icon name={bandIcon} className="h-3.5 w-3.5"/>{eyebrow}</p>
      {onRename ? <Cell … className="mt-1 !px-0 font-display !text-xl font-extrabold tracking-tight !text-runfree-ink sm:!text-2xl"/> : <h3 className="mt-1 font-display text-xl font-extrabold tracking-tight text-runfree-ink sm:text-2xl">{title}</h3>}
    </div>
    <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-runfree-ink"><Icon name="x" className="h-4 w-4"/></button>
  </div>
  <div className="px-5 py-6 sm:px-7">{children}</div>
</section>
```
- Add the prop `bandIcon: IconName`. ExecutionPanel passes it from the selection's band: beyond→telescope, background→flag, midground→target, foreground→footprints.
- Children own their own `space-y-8`.
- The shell still owns eyebrow and title. InitiativeDetail and BackgroundDetail must not print the name.

3b. InitiativeDetail.tsx (57-342). The root is `<div className="space-y-8">`, in this order:

(1) Status block:
```
<div className="flex flex-wrap items-start justify-between gap-3">
  <div className="min-w-0 space-y-1.5">
    <div className="flex flex-wrap items-center gap-2"><StatusMark status={status} size="lg" labelHidden/><StatusWord status={status} size="sm"/><Chip tone="navy">{kind.label}</Chip>{i.is_complete && <Chip tone="accent">Finished</Chip>}<TrendStrip updates={trend}/></div>
    <p className="text-sm text-gray-600">{existing 'Last check-in N days ago' — wrap in font-semibold text-amber-700 when stale}</p>
    {reviewOpen && <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-700"><Icon name="calendar" className="h-3.5 w-3.5"/>{existing review sentence}</p>}
    {pace?.behind && <p className="text-sm font-semibold text-amber-700">{existing}</p>}
  </div>
  {canLog && <button className={nudge ? 'inline-flex items-center gap-1.5 rounded-lg bg-runfree-grad px-3.5 py-2 text-xs font-bold text-white hover:opacity-90' : PINK_BUTTON}><Icon name="message" className="h-3.5 w-3.5"/>Post this week's check-in</button>}
</div>
```
- The RAG_RING pill is removed from Execution. RAG_RING stays exported and unused here.
- Keep the gate exactly as the current code has it on this button. Do not change which flag it reads.

Meta strip (replaces the header-fields card), directly under the status block. Remove the `rounded-xl bg-white … lg:grid-cols-4` card:
```
<dl className="flex flex-wrap gap-x-6 gap-y-2 border-t border-gray-200 pt-4">{[['user','Owner',ownerCell],['users','Team',teamCell],['calendar','Start date',startDateCell],['calendar','Next review',nextReviewCell]].map(([icon,label,cell])=>(<div key={label} className="flex min-w-0 items-center gap-1.5"><Icon name={icon} className="h-3.5 w-3.5 shrink-0 text-gray-400"/><dt><Label>{label}</Label></dt><dd className="min-w-[7rem]">{cell}</dd></div>))}</dl>
```
- The Cells and DateCells, and their `disabled={!canEdit}`, are unchanged.

(2) CheckIn form (354-450), when open:
  `<form className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-runfree-magenta/30 sm:p-5">`
- First child: `<SubHeading icon="message">This week's check-in</SubHeading>`, then `mt-3`.
- The RagPicker in this form stays LOUD (no `quiet`). It is the form's main control.
- Date input, textarea and EditorActions are unchanged.

(3) Scoreboard (575-651):
```
<div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-5"><StepStrip steps={steps} className="!h-2.5"/><dl className="mt-4 grid grid-cols-2 gap-y-4 sm:grid-cols-4 sm:divide-x sm:divide-gray-100">…</dl></div>
```
- Stat (653-662): `<div className="px-3 sm:first:pl-0"><dd className={`font-display text-xl font-extrabold leading-none tabular-nums ${tone}`}>{value}</dd><dt className="mt-1.5"><Label>{label}</Label></dt></div>`
- Tones are unchanged: rose-600 past due, amber-600/rose-600 days.
- Steps-by-colour value: `<span className="flex items-center gap-2.5">{(['green','amber','red'] as const).map(s=><span key={s} className="flex items-center gap-1"><StatusMark status={s} size="sm"/><span className="tabular-nums">{count(s)}</span></span>)}</span>`
- Labels are unchanged: Steps / Past due / Cost / Days left of 90.

(4) Action steps:
- Heading: `<SubHeading icon="check-square" count={steps.length} aside={<span className="text-[11px] text-gray-500">{existing kind hint}</span>}>Action steps</SubHeading>`
- List: `<ol className="mt-3 space-y-2">`

StepRow (671-787):
```
<li className={`group rounded-2xl px-4 py-3 ring-1 transition-colors ${overdue ? 'bg-rose-50/40 ring-rose-200' : 'bg-white ring-gray-200 hover:ring-gray-300'}`}>
 <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
  <div className="flex min-w-0 flex-1 items-start gap-3">
   <span aria-hidden className="mt-[5px] w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-500">{n}</span>
   <div className="min-w-0 flex-1">
    <Cell … wrap className={`!px-0 text-[15px] font-medium ${s.status==='green' ? '!text-gray-500' : '!text-runfree-ink'}`}/>
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
      <span className="flex items-center gap-1"><Icon name="calendar" className="h-3.5 w-3.5 text-gray-400"/><span className="sr-only">By</span><Cell … placeholder="By when" className={`!text-xs ${overdue ? '!font-semibold !text-rose-700' : ''}`} display={v=>isDateish(v)?prettyDate(v):v}/>{overdue && <span className="font-semibold text-rose-700">past due</span>}</span>
      <span className="flex items-center gap-1"><Icon name="user" className="h-3.5 w-3.5 text-gray-400"/><span className="sr-only">Accountable</span><Cell … placeholder="Accountable" className="!text-xs"/></span>
      <span className="flex items-center gap-1"><span aria-hidden className="text-gray-400">$</span><span className="sr-only">Cost</span><Cell … placeholder="Cost" className="!text-xs"/></span>
      <span className="flex items-center gap-1"><Icon name="users" className="h-3.5 w-3.5 text-gray-400"/>{canManageSteps ? <Select aria-label="Assigned" size="xs" value=… onChange=…>…existing options…</Select> : <span className="text-gray-600">{assignedName || 'Nobody'}</span>}</span>
    </div>
   </div>
  </div>
  <div className="flex shrink-0 items-center justify-end gap-3 sm:flex-col sm:items-end sm:gap-1">
    <RagPicker quiet value={s.status} onChange=… disabled={!canManageSteps} label={`Step ${n} light`}/>
    {canManageSteps && <button type="button" className="text-[10px] font-semibold text-gray-500 hover:text-rose-600">Remove</button>}
  </div>
 </div>
</li>
```
- By and Cost stay free-text Cells. Overdue logic is unchanged, and anything that is not yyyy-mm-dd is never overdue.
- No strikethrough on green steps.
- Every gate stays on the exact flag it reads today (Cells editable, Select, RagPicker, Remove). Diff the gates line by line against the old StepRow.

Add-step form:
- `<form className="mt-2 flex gap-2">`
- Input: `rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta`
- Button: `<button className={PINK_BUTTON}>Add</button>`

(5) Check-ins:
- Heading: `<SubHeading icon="message" count={updates.length} aside={existing 'Show all N' button, class text-[11px] font-semibold text-runfree-magentaDeep hover:underline}>Check-ins</SubHeading>`

UpdateHistory (452-508), still the latest 3:
```
<ul className="mt-3 divide-y divide-gray-100 rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">{updates.map(u=>(<li className="flex items-start gap-3 px-4 py-3"><StatusMark status={u.status} size="sm" className="mt-1.5"/><div className="min-w-0 flex-1"><p className="text-xs text-gray-500"><span className="font-semibold tabular-nums text-runfree-ink">{prettyDate(u.date)}</span> · {RAG_LABEL[u.status]}</p><p className="mt-0.5 text-sm text-runfree-ink">{u.note}</p></div>{existingDeleteGate && <button className="text-[10px] font-semibold text-gray-500 hover:text-rose-600">Delete</button>}</li>))}</ul>
```

(6) The plan (folded):
```
<div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200"><button type="button" aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3.5"><SubHeading icon="book" aside={<span className="text-[11px] text-gray-500">{existing 'N of 6 blocks written'}</span>}>The plan</SubHeading><span className="shrink-0 text-xs font-semibold text-runfree-magentaDeep">{open ? 'Hide' : 'Read the plan'}</span></button>{open && <div className="divide-y divide-gray-100 border-t border-gray-100">…PlanBlock…<div className="px-4 py-3.5"><Label>Type of initiative</Label><Select …existing options, disabled={!canEdit}/>…existing hint text-xs text-gray-500</div></div>}</div>
```
- SubHeading renders an h4. Inside the button that is invalid, so pass `as="span"`. SubHeading supports this (see primitives).

PlanBlock (510-566):
- `<div className="px-4 py-3.5"><Label>{f.label}</Label><RichTextView className="mt-1" …/>{canEdit && <button className="mt-1 text-[11px] font-semibold text-gray-500 hover:text-runfree-magentaDeep">Edit</button>}</div>`
- The `bg-gray-50` inner card is removed.

(7) Footer, unchanged in copy and gates:
- `<div className="flex flex-wrap gap-4 border-t border-gray-200 pt-4">`
- Buttons: `text-xs font-semibold text-gray-500 hover:text-runfree-magentaDeep` for "Mark this initiative finished"; Delete gets `hover:text-rose-600`.

3c. MidgroundDetail.tsx (44-213). The root is `space-y-8`.
- The navy h4 becomes `<SubHeading icon="target" aside={<span className="text-[11px] text-gray-500">qualitative and quantitative</span>}>The one-year goal</SubHeading>`.
- Blockquote (text verbatim, unchanged): `<blockquote className="mt-3 rounded-2xl border-l-4 border-runfree-navy/30 bg-white px-4 py-3 text-sm leading-relaxed text-gray-600 shadow-sm ring-1 ring-gray-200">{DEFINITION}<footer className="mt-1 font-display text-[11px] font-bold text-runfree-navy">God Dreams</footer></blockquote>`
- Statement: `RichTextView className="mt-4 !text-base !text-runfree-ink"`. The Write it / Edit buttons are unchanged.
- MIDGROUND_TESTS list: `rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600`, with `list-disc pl-5` inside.
- "How we'll know": `<SubHeading icon="chart" count={measures.length}>How we'll know</SubHeading>`, then `<ul className="mt-3 space-y-3">`.

MeasureRow (215-445):
- Row: `<li className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-gray-200">`
- Top row: `flex flex-wrap items-start justify-between gap-3`. Label Cell: `!px-0 font-display !text-sm font-bold !text-runfree-ink`. When canLog: `<button className={PINK_BUTTON}>Log this week's number</button>`.
- The full MeasureMosaic is unchanged (`className="mt-3"`).
- Sparkline goes under it.
- Editors: `<div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">` of `<div><Label>Baseline</Label><NumCell/></div>` ×4 (Baseline / Target / Unit / Current).
- Log form: `rounded-xl bg-gray-50 p-3`, with the same inputs and the gradient "Log it" (EditorActions primary).
- History rows: `text-xs text-gray-600`, unchanged widths.
- Remove: `text-[10px] font-semibold text-gray-500 hover:text-rose-600`.

Small (447-456): render `<Label>` instead.

Sparkline (487-517): keep the 180 width, height becomes 32, `className="mt-3 h-8 w-full max-w-[180px]"`. Draw:
- area `fill="#E43D96" fillOpacity={0.1}`
- line `stroke="#C21F73" strokeWidth={1.75} strokeLinejoin="round" fill="none"`
- last point `<circle r={3} fill="#C21F73" stroke="#fff" strokeWidth={1.5}/>`
- Still only when there are ≥2 readings.

Add-measure form: input `rounded-lg border border-gray-300 px-3 py-2 text-sm`, submit PINK_BUTTON.

3d. BackgroundDetail.tsx (1-161). Root `space-y-8`.
- Title Cell (editors only): `!px-0 font-display !text-xl font-extrabold tracking-tight !text-runfree-ink sm:!text-2xl`.
- "The objective, in full" becomes `<SubHeading icon="flag">The objective, in full</SubHeading>`, with RichTextView `mt-3 !text-base` below it.
- The Vision Notes h4 becomes `<SubHeading icon="book">Background Vision Notes</SubHeading>`.
- Notes grid: `<div className="mt-3 grid gap-3 lg:grid-cols-3">`, each note `<div className="rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-gray-200">`:
  - `<p className="font-display text-sm font-bold text-runfree-ink">{Where We Stand | Where We're Headed | How We'll Get There}</p>`
  - `RichTextView className="mt-1.5"`
  - empty: `<p className="mt-1.5 text-sm text-gray-500">` with the existing role-split copy, not italic
  - Edit: `mt-1 text-[11px] font-semibold text-gray-500 hover:text-runfree-magentaDeep`

3e. BeyondDetail.tsx (1-309). Editor-only; every gate is unchanged. Root `space-y-8`.
- Headings become SubHeading: ('telescope','The vivid description'), ('book','The full vivid description, as a PDF'), ('flag','Vision templates', aside `{chosen.length} of 2`).
- The "Attach a PDF" label-as-button, Choose/Change, and the PDF Remove use PINK_BUTTON classes. Remove stays `text-[11px] font-semibold text-gray-500 hover:text-rose-600`.
- Chosen card: `flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-gray-200`, icon `h-10 w-10 rounded-lg`, name `text-sm font-bold`, group Chip, definition `text-xs text-gray-600`.
- Picker well: `rounded-2xl bg-gray-50 p-4`. Group label: `<Label>` with a 16px icon.
- Options: `rounded-lg bg-white px-2.5 py-2 text-left text-xs font-semibold ring-1 ring-gray-200 hover:ring-runfree-magenta/40`. Chosen: `bg-runfree-pink text-runfree-magentaDeep ring-runfree-magenta/40`. Full: `text-gray-400 cursor-not-allowed`. Keep the max of 2.

==================================================================
STEP 4 — ExecutionPanel: header, ThisWeek, SetupStrip, AddInitiative, finished, Framework
==================================================================
4a. Header (ExecutionPanel 63-354):
- Wrap execute-icon.png and VisionFrameMark in `<div className="mx-auto inline-flex items-center gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-gray-200">`, both at `h-8 w-8`.
- Eyebrow, h2 and note are unchanged.
- Section spacing is unchanged: ThisWeek mt-8, board section mt-10, Measures/Renewal/Framework mt-12.

4b. ThisWeek (623-913), with Stat (940-953) and Line (915-938). The data, reasons merging, the >1-owner toggle rule, and the digest string are byte-identical. Do not touch the function that builds the Copy text.
```
<section className="mt-8 overflow-hidden rounded-3xl bg-runfree-navy text-white shadow-sm">
 <div aria-hidden className="h-1.5 bg-runfree-grad"/>
 <div className="px-5 py-5 sm:px-7 sm:py-6">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="min-w-0">
    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-pink">This week</p>
    <h3 className="mt-1.5 flex flex-wrap items-baseline gap-x-2"><span className="font-display text-3xl font-extrabold leading-none tabular-nums sm:text-4xl">{talk}</span><span className="font-display text-xl font-extrabold tracking-tight">{talk===1 ? 'thing' : 'things'} to talk about</span></h3>
    <p className="mt-1.5 text-xs text-white/70">{existing next-renewal line}</p>
   </div>
   <button type="button" onClick={copy} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-xs font-bold ring-1 ring-white/20 transition-colors hover:bg-white/20 sm:w-auto"><Icon name="clipboard" className="h-3.5 w-3.5"/>{copied ? 'Copied' : 'Copy update'}</button>
  </div>
  <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">…Stat×4…</dl>
  <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4">
   <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-pink">Agenda</p>
   {owners.length>1 && <div role="group" aria-label="Group the agenda" className="inline-flex rounded-lg bg-white/10 p-0.5 ring-1 ring-white/10">{/* active */}<button aria-pressed className="rounded-md bg-white px-2.5 py-1 text-[11px] font-bold text-runfree-navy">By initiative</button>{/* idle */}<button aria-pressed={false} className="rounded-md px-2.5 py-1 text-[11px] font-bold text-white/75 hover:text-white">By person</button></div>}
  </div>
  <ul className="mt-2 space-y-0.5">…Line…</ul>
 </div>
</section>
```
- Keep the existing "whole thing is null when nothing is live" rule.

Stat:
```
<div className="rounded-2xl bg-white/10 px-4 py-3.5 ring-1 ring-white/10"><dd className={`font-display text-3xl font-extrabold leading-none tabular-nums ${tone==='rose' ? 'text-rose-300' : tone==='amber' ? 'text-amber-300' : 'text-white'}`}>{n}{of!=null && <span className="ml-1 text-sm font-semibold text-white/60">/ {of}</span>}</dd><dt className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">{label}</dt>{bar!=null && <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-runfree-orangeLight" style={{width:`${bar}%`}}/></div>}</div>
```
- The dd/dt order is visual only. Keep dt before dd in the DOM, and use `flex flex-col-reverse` on the tile if needed for valid dl semantics.
- Labels are unchanged: In flight / Need attention / Past due / Day of the ninety.
- The day bar is a time elapsed bar that already exists, not initiative completion.

Line:
```
<li><button type="button" onClick className="group flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left text-[15px] text-white/85 transition-colors hover:bg-white/5 focus-visible:bg-white/10"><span className="mt-[7px]">{dot}</span><span className="min-w-0 flex-1">{node}</span><span aria-hidden className="shrink-0 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white">→</span></button></li>
```
- `dot`: when the line carries a RAG status, `<StatusMark status size="sm" labelHidden/>` (the words already follow). The existing non-RAG reason dots (bg-amber-300/70, bg-rose-400) become `h-2.5 w-2.5 rounded-[3px]` in the same colours.
- Name `font-semibold text-white`, reasons `text-white/85`, owner `text-white/60`.

4c. SetupStrip (447-516). Same four steps, same done logic, same per-step navigation, hidden when all four are done. Rendered directly under the Horizon Storyline BlockHeading.
```
<div className="mb-4 inline-flex max-w-full flex-wrap items-center gap-1 rounded-3xl bg-white p-1 shadow-sm ring-1 ring-gray-200 sm:rounded-full">{steps.map((s,i)=>(<button type="button" key onClick className={`inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-xs font-semibold transition-colors hover:bg-runfree-indigo/60 ${s.done ? 'text-gray-500' : 'text-runfree-ink'}`}>{s.done ? <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white"><Icon name="check" className="h-3 w-3"/></span> : <NumberDisc n={i+1}/>}{s.label}{s.detail && <span className="font-normal text-gray-500">{s.detail}</span>}</button>))}</div>
```

4d. AddInitiative (518-605):
- Trigger: `<button className={PINK_BUTTON}><Icon name="plus" className="h-3.5 w-3.5"/>Add an initiative</button>`
- The form is unchanged: input `rounded-lg border border-gray-300 px-3 py-2 text-sm`, submit `rounded-lg bg-runfree-grad px-3.5 py-2 text-xs font-semibold text-white`.

Row under the board: `<div className="mt-3 flex flex-wrap items-center gap-2">` holding AddInitiative and the finished controls.

"Show N finished" toggle: `text-xs font-semibold text-gray-500 hover:text-runfree-magentaDeep`. It must stay reachable for everyone who can see it today.

Finished pills:
- `inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm ring-1 ring-gray-200 hover:ring-runfree-magenta/40`
- Selected: `ring-2 ring-runfree-magenta text-runfree-ink`
- Leading `<Icon name="check" className="h-3 w-3 text-emerald-600"/>`

4e. Framework (962-994): `rounded-3xl bg-white px-4 py-4 shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-runfree-magenta/40`. The rest is unchanged.

4f. Board BlockHeading: unchanged copy.

==================================================================
STEP 5 — MinistryDashboard.tsx and MeasureMosaic.tsx
==================================================================
5a. Declare ONE constant at the top of MinistryDashboard.tsx:
  `const ROW_GRID = 'grid grid-cols-3 items-center gap-x-2 gap-y-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_6.5rem] sm:gap-y-0';`
Both the column-head row and MetricRow use it, so they cannot drift. That keeps 3 columns on phone and 5 from sm.

5b. CategoryGroup (186-298):
```
<div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-gray-200">
 <div className="px-4 pt-4 sm:px-5">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h4 className="flex items-center gap-2 font-display text-base font-extrabold tracking-tight text-runfree-ink"><span className="grid h-6 w-6 place-items-center rounded-md bg-runfree-indigo text-runfree-navy"><Icon name="chart" className="h-3.5 w-3.5"/></span>{category}{canEdit && <button type="button" className="ml-1 text-[11px] font-semibold text-gray-500 hover:text-runfree-magentaDeep">Rename</button>}</h4>
   <p className="text-[11px] text-gray-500">{existing count}</p>
  </div>
  <div className={`mt-3 hidden border-b border-gray-100 pb-2 sm:grid ${ROW_GRID}`}><span/><Label className="text-right">Prior yr.</Label><Label className="text-right">Now</Label><Label className="text-right">Goal (next yr.)</Label><Label className="text-right">Status</Label></div>
 </div>
 <ul className="divide-y divide-gray-100">…MetricRow…</ul>
 {canEdit && <form className="flex items-center gap-2 border-t border-gray-100 px-4 py-2 sm:px-5"><Icon name="plus" className="h-3.5 w-3.5 text-gray-400"/><input className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1.5 text-sm placeholder:text-gray-500 focus:bg-gray-50 focus:outline-none focus-visible:ring-1 focus-visible:ring-runfree-magenta" placeholder={`Add a measure under ${category}`}/><button className="text-xs font-semibold text-runfree-magentaDeep hover:underline">Add</button></form>}
</div>
```
- Groups stack with `space-y-4`.
- Remove the indigo header bar, the separate white caption row, and the gray-50 footer.
- The rename-in-place behaviour is unchanged.

5c. MetricRow (312-417):
```
<li className="group px-4 py-3 sm:px-5"><div className={ROW_GRID}>
  {label Cell className="col-span-3 !px-0 font-display !text-sm font-bold !text-runfree-ink sm:col-span-1"}
  {LabelledValue prior / now / goal: numbers tabular-nums text-right; Now font-semibold; phone captions via LabelledValue now use <Label>}
  <span className="col-span-3 flex items-center justify-end gap-1 sm:col-span-1">
    <button type="button" aria-label={`Trend: ${trendWord}`} className={`w-5 text-center text-sm ${m.trend ? 'text-runfree-navy' : 'text-gray-400'}`}>{arrow}</button>
    <RagPicker quiet value … disabled={!canEdit} label={`${m.label} light`}/>
    {canEdit && <button type="button" aria-label="Delete measure" className="grid h-7 w-7 place-items-center rounded-full text-gray-400 hover:bg-rose-50 hover:text-rose-600">×</button>}
  </span>
  {parsed && <div className="col-span-3 sm:col-start-2 sm:col-end-5"><TrajectoryChart prior={prior} now={now} goal={goal} reached={reached}/></div>}
</div></li>
```
- The trend-cycling handler and the gates are unchanged.
- If the current phone layout puts the label on its own row, keep that. The col-span classes above assume it does. Verify against lines 312-417 before changing them.

5d. TrajectoryChart replaces Trajectory (423-460) in the same file.
- Positions come from percentages over a stretched SVG. Marks are HTML spans, so they never distort.
- x: prior 16.667, now 50, goal 83.333 (the column centres of the three equal number columns).
- y: `const lo=Math.min(prior??now,now,goal), hi=Math.max(prior??now,now,goal); const y=(v)=> hi===lo ? 22 : 38 - ((v-lo)/(hi-lo))*32;` (viewBox units 0–44)
- If prior is null, skip the prior mark and the solid segment.
```
<div aria-hidden className="relative mt-2 h-11 w-full">
 <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 44" preserveAspectRatio="none">
  {[16.667,50,83.333].map(x=><line key={x} x1={x} x2={x} y1={4} y2={40} stroke="#E9EDF9" strokeWidth={1} vectorEffect="non-scaling-stroke"/>)}
  {prior!=null && <path d={`M16.667,${y(prior)} L50,${y(now)} L50,40 L16.667,40 Z`} fill="#E43D96" fillOpacity={0.1}/>}
  {prior!=null && <path d={`M16.667,${y(prior)} L50,${y(now)}`} fill="none" stroke="#C21F73" strokeWidth={1.75} vectorEffect="non-scaling-stroke"/>}
  <path d={`M50,${y(now)} L83.333,${y(goal)}`} fill="none" stroke={reached ? '#10B981' : '#F15A25'} strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke"/>
 </svg>
 {prior!=null && <span className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-400" style={{left:'16.667%',top:`${y(prior)/44*100}%`}}/>}
 <span className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white ${reached ? 'border-emerald-500' : 'border-runfree-orange'}`} style={{left:'83.333%',top:`${y(goal)/44*100}%`}}/>
 <span className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-runfree-magentaDeep shadow-sm ring-2 ring-white" style={{left:'50%',top:`${y(now)/44*100}%`}}/>
</div>
```
- Keep the existing parse rule and `reached` rule. Only render when the numbers parse (unchanged).
- `max-w-md` is gone.

5e. New-header form (MinistryDashboard 31-184):
```
<form className="rounded-3xl bg-runfree-indigo/40 px-5 py-4"><p className="font-display text-sm font-extrabold text-runfree-ink">Add a header</p><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label><Label>New header</Label><input className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"/></label><label><Label>Its first measure</Label><input …same/></label><button className={PINK_BUTTON}>Add header</button></div></form>
```
- Editor-only gating is unchanged. No dashed border.

Empty state: `rounded-3xl border border-dashed border-gray-200 px-5 py-8 text-center text-sm text-gray-500`, with the existing role-split copy.

"Show/Hide N strategy inputs — set aside for now": unchanged text, `text-xs font-semibold text-gray-500 hover:text-runfree-magentaDeep`. The legacy group renders through the same CategoryGroup.

5f. MeasureMosaic.tsx (1-104):
- TILE_COLOURS, tile count, lighting rule and the "% of the way" caption are unchanged.
- Compact label: `min-w-0 truncate text-xs font-semibold text-runfree-ink`.
- Captions: `text-[11px] text-gray-500` (was gray-400).
- The "/ target" suffix stays `text-xs font-semibold text-gray-400`.

==================================================================
STEP 6 — RenewalCycle.tsx (1-142)
==================================================================
Unchanged: the generation from the earliest live start_date, next-only default, twelve-with-year-breaks unfold, the editor-only no-anchor prompt, and the footnote copy.

The toggle moves into `BlockHeading action={…}`:
  `<button type="button" aria-expanded={all} className={PINK_BUTTON}>{existing labels: 'Show the full three-year cycle — 12 dates' / 'Show only the next stop'}</button>`
```
<div className="rounded-3xl bg-white px-4 py-4 shadow-sm ring-1 ring-gray-200 sm:px-5">
 <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-[9px] before:top-3 before:w-px before:bg-gray-200">
  {yearBreak && <li className="relative py-1 pl-8"><span className="relative -ml-8 inline-block rounded-full bg-white px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500 ring-1 ring-gray-200">Year {s.year}</span></li>}
  <li className={`relative flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl py-2.5 pl-8 pr-3 ${isNext ? 'bg-runfree-pink/50' : ''}`} aria-current={isNext ? 'step' : undefined}>
   <span aria-hidden className={`absolute left-[3px] top-[15px] h-3.5 w-3.5 rounded-full ${isNext ? 'bg-runfree-magentaDeep ring-4 ring-runfree-pink' : past ? 'bg-gray-300 ring-4 ring-white' : 'border-2 border-runfree-navy/30 bg-white ring-4 ring-white'}`}/>
   <span className={`w-28 shrink-0 font-display text-sm font-extrabold tabular-nums ${past ? 'text-gray-500' : 'text-runfree-ink'}`}>{prettyDate(s.date)}</span>
   <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isNext ? 'bg-runfree-magentaDeep text-white' : past ? 'bg-gray-100 text-gray-500' : 'bg-runfree-indigo text-runfree-navy'}`}>{s.length}</span>
   <span className={`order-last w-full min-w-0 text-sm sm:order-none sm:w-auto sm:flex-1 ${past ? 'text-gray-500' : 'text-gray-600'}`}>{s.purpose}</span>
   <span className="ml-auto shrink-0 text-[11px] tabular-nums text-gray-500">{s.marker}</span>
  </li>
 </ol>
</div>
<p className="mt-2 text-[11px] text-gray-500">{existing footnote}</p>
```
- Field names (s.date etc.) must match whatever the stop type actually uses. Read lines 30-142 first.
- The marker keeps its existing text but drops `uppercase`.

==================================================================
STEP 7 — phone pass (390), both roles
==================================================================
This Week:
- Tiles go 2×2 (`grid-cols-2`).
- The count and title wrap.
- Copy update is full width under the title (`w-full sm:w-auto`).
- The Agenda row keeps the label on the left and the segmented control on the right, wrapping if needed.

Board:
- The rail is a horizontal strip (`flex-row flex-wrap`, `bg-gradient-to-r`), with the icon first and "You are here" at `ml-auto`.
- Cards stack single-column with `gap-3 p-3`.
- The Beyond statement drops to `text-lg`, and the aside stacks under it with `border-t`.
- The sunset line runs full width.
- The caret still points down into the detail.

Detail:
- The meta strip wraps. Give each item `min-w-[45%]` so they pair up.
- Scoreboard is 2×2 with `gap-y-4`, and the `sm:divide-x` drops.
- StepRow: description, then the wrapping icon meta line, then a row with the RagPicker and Remove right-aligned (`flex-col` → `sm:flex-row`, as specced).
- The quiet RagPicker shows all three options on coarse pointers.

Measures:
- ROW_GRID gives 3 columns with LabelledValue captions.
- TrajectoryChart spans all three columns.

Renewal: the purpose line wraps to full width via `order-last`.

Tap targets:
- Do not add padding to `text-[10px]`/`text-[11px]` text buttons (Edit, Remove, Rename, Delete, Show all). The globals rule grows those.
- `text-xs` buttons that are rounded-lg (PINK_BUTTON) are excluded from that rule, so they are sized explicitly with `py-2`.
- Close is `h-8 w-8`.
- RagPicker targets are `h-7 w-7` (unchanged contract).

Inputs keep the 16px floor from globals.

Viewer check, confirm each:
- No "Edit the vision", "Choose two templates", "+ Add", Rename, or "Write objective" copy.
- The Beyond aside is omitted when empty.
- Every RagPicker shows a single tile.
- DateCell renders plain text with no button affordance.

## Status system

One shape and one word system, everywhere on the tab.

Light
- Shape: a StatusMark tile (a rounded square with an inset bottom edge, coloured from lib's RAG_DOT emerald/amber/rose, which is untouched).
- Where it appears: board initiative cards, the detail status row (lg), This Week agenda lines (sm), check-in history (sm), the Scoreboard steps-by-colour counts, and the chosen option of every RagPicker.
- Word: the tile always travels with its word. StatusWord uses RAG_LABEL ("On track" / "At risk" / "Not started or stuck") in STATUS_TEXT (emerald-800 / amber-800 / rose-700).
  - On the board the word leads the owner line.
  - In the detail it sits beside the lg tile.
  - In This Week the reason text already says it.
- Colour is never the only channel.
- The RAG_RING pill is retired from Execution; the token stays exported in lib.
- No RagPicker on an initiative. Status changes only through "Post this week's check-in".

Progress language
- StepStrip, TrendStrip and MeasureMosaic share the same tile shape (rounded-[2px]–[4px], gap-[3px]).
- StepStrip: one segment per step in RAG_DOT, indigo when there are no steps. h-1.5 on the board, h-2.5 in the Scoreboard.
- TrendStrip: only with 2 or more check-ins. Oldest first; earlier tiles 6px at 60% opacity, the latest 10px.
- MeasureMosaic keeps the God Dreams palette and its "% of the way". That and the pace sentence are the only percentages.
- No completion bar or ratio anywhere. "N of M steps open" stays words.
- The day-of-ninety bar in This Week is elapsed time and already exists.

Stale (more than 14 days, STALE_AFTER_DAYS)
- "Nd since check-in" turns `font-semibold text-amber-700`.
- The card's NumberDisc turns `bg-amber-100 text-amber-900`, so it is visible across the room.
- In the detail, "Last check-in N days ago" turns semibold amber-700.

Review due (reviewDue)
- Board: a sentence-case chip `rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900` reading "Review due", top-right of the card.
- Detail: the existing review sentence in `text-sm font-semibold text-amber-700` with a calendar icon.
- It still beats the 14-day stale rule and is still cleared by a later check-in (logic unchanged).

Behind pace
- The existing sentence in `text-xs` (board) / `text-sm` (detail) `font-semibold text-amber-700`, only under initiativePace's hard trigger.

Days of 90
- `text-[11px] font-semibold tabular-nums`, sentence case "44d left" / "3d over".
- Colour: gray-500; amber-700 at 14 days or fewer; rose-700 when over.

Past-due step
- The rose-200 ring plus a rose-50/40 tint on the row.
- The "by" date in `font-semibold text-rose-700`, followed by the words "past due".

Done step
- Text in gray-500 with a green tile in the picker. No strikethrough.

Finished initiative
- The accent Chip "Finished" in the detail.
- Board-row pills with an emerald check icon, reachable via "Show N finished".

Measures
- Trend arrow ↑→↓ in runfree-navy when set, gray-400 when unset. The aria-label names the trend.
- Quiet RagPicker.
- TrajectoryChart meanings:
  - grey dot = prior
  - magenta filled dot = now
  - hollow orange ring = goal (emerald when reached)
  - solid magenta segment prior→now, dashed orange/emerald segment now→goal

Selection (not a status)
- `ring-2 ring-runfree-magenta shadow-lg` plus a 12px magenta caret on the card's bottom edge pointing into the detail.
- Beyond selection: `bg-runfree-pink/50` with a 3px inset magenta left edge.
- Hover: `ring-runfree-magenta/40`. Only Foreground cards lift (`-translate-y-0.5`).
- aria-pressed stays on every board button.

Colour roles
- magenta = selected / now / current reading
- orange / orangeLight = goal / You are here / day bar
- indigo = discs and unlit tiles
- pink = CTA tint and the next Renewal stop

Viewers
- Every RagPicker collapses to one lit tile.

## Phone

390px, viewer and admin. The rules:
- No horizontal scroll.
- Nothing spills.
- Every band stacks.
- The pointer:coarse CSS stays the tap-target mechanism for `text-[10px]` / `text-[11px]` / non-rounded `text-xs` buttons, so don't add per-button padding to those.

This Week
- `px-5 py-5`.
- The count (text-3xl) and "things to talk about" wrap onto two lines.
- Copy update drops under the title as `w-full` (`sm:w-auto`).
- Stat tiles are `grid-cols-2 gap-3`. Check that "Day of the ninety" does not wrap under its bar; if it does, the tile keeps the bar below the label.
- The Agenda row wraps: label left, segmented control right.
- Agenda lines are full-width buttons whose text wraps. The arrow stays at the right.

Board
- The rail becomes a horizontal strip with `bg-gradient-to-r`, `px-4 py-2.5`, in this order: icon, band name, span Label, sub. "You are here" (pin plus label) sits at `ml-auto` on the Foreground strip.
- Band bodies keep their ground: the Beyond sky wash, and the Foreground #E4E9F8.
- Cards stack in one column with `grid gap-3 p-3`.
- The Beyond statement drops to `text-lg`. The aside stacks under it with `border-t`, and viewers with nothing chosen and no PDF get no aside at all.
- The 3px sunset line spans full width under Beyond.
- The caret still points into the detail, which renders under the clicked band as today. scrollIntoView (block: nearest) only fires on user clicks.
- Hover lift is irrelevant on touch. `motion-reduce` disables it.

Detail
- DetailShell is `px-5`. The title is text-xl. Close is a 32px circle.
- The meta strip wraps two per line (`min-w-[45%]`).
- Scoreboard stats are 2×2 with no dividers.
- StepRow is a stacked card, top to bottom:
  1. Index and description.
  2. One wrapping icon meta line: date and "past due", accountable, $ cost, assigned Select.
  3. A right-aligned row with the RagPicker (all three options visible on coarse pointers via `[@media(pointer:coarse)]:opacity-100`) and Remove.
- Check-in history, plan blocks and Background notes are single column.
- MeasureRow NumCells wrap (`flex-wrap gap-x-6`).
- The Beyond picker options wrap in their existing `sm:grid-cols-3`, which is one column on phone.

Measures
- ROW_GRID gives 3 columns on phone: the label on its own row, then Prior / Now / Goal via LabelledValue with Label captions, then the controls row right-aligned.
- TrajectoryChart spans all three columns, full width. Its x positions (16.7 / 50 / 83.3%) line up with the three phone columns too.
- The add-measure row stays a single line.
- The New-header form stacks (`grid gap-3`, then `sm:grid-cols-[1fr_1fr_auto]`).

Renewal
- The timeline line and nodes stay at the left (`pl-8`).
- The date and length pill share a line; the purpose wraps full width via `order-last`; the marker trails at `ml-auto`.
- The toggle sits in the BlockHeading action slot and wraps under the note (`flex-wrap`).

Other
- Inputs stay at 16px under 640px through the existing globals rule.
- Explicitly sized controls: Close is h-8 w-8, RagPicker targets are h-7 w-7, and PINK_BUTTON is py-2. PINK_BUTTON is rounded-lg, so the coarse rule skips it; it is sized explicitly for that reason.
- Viewer screens must show no editor copy: no "Edit the vision →", "Choose two templates", "+ Add…", "Write objective N", Rename, or Add-a-measure rows. DateCells show plain text. RagPickers show a single tile.
- Expected length: about 15–20% shorter than today's 17,434px capture. Verify, don't assume.

## Accessibility

Contrast

| Element | Before | After | Ratio |
|---|---|---|---|
| This Week labels | white/50 | white/70 on runfree-navy #1F378C | ≥4.5:1 |
| This Week arrows | white/30 | white/40 | decorative, aria-hidden |
| Field, column and caption labels | gray-400 | gray-500 | 4.6:1 on white |

- No text is set in gray-300 except the empty-value dash "—", which is decorative and paired with an aria-label on the DateCell.
- Board text:
  - Ink on the Foreground ground #E4E9F8: about 10:1.
  - Navy on the Background rail's darker stop #BFC9EC: about 5.5:1.
  - White on the Mid-Ground rail's lighter stop #4A63B8: about 5.8:1.
  - Rail faint text is white/70–75 or navy/70. Check it with a contrast tool on the gradient's worst stop before merging.
- Status and amber text:
  - STATUS_TEXT words (emerald-800, amber-800, rose-700) all clear 4.5:1 on white.
  - Amber-700 sentences clear 4.5:1 on white.
  - The amber-900-on-amber-100 chip clears 7:1.

Colour is never the only signal
- Every StatusMark is either given an sr-only RAG_LABEL or sits next to a visible StatusWord (`labelHidden` then prevents a double announcement).
- Stale is also carried by words.
- Past-due is also carried by the words "past due".
- Review due is a text chip or sentence.
- Selection is also a 2px ring plus a caret, and aria-pressed stays on every board button.

Semantics
- Board boxes stay `<button type="button" aria-pressed>`.
- NumberDisc is aria-hidden, with sr-only "Objective N." / "Initiative N." text.
- These are aria-hidden: the caret, the sunset line, the rail icons, the timeline nodes, TrajectoryChart and Sparkline. The numbers they draw remain real text in the Cells.
- The Renewal next stop gets `aria-current="step"`.
- The heading outline stays: h2 (panel) → h3 (BlockHeading, DetailShell, This Week) → h4 (SubHeading, CategoryGroup). Inside the plan toggle button, SubHeading renders as a span.
- The This Week grouping control is `role="group"` with `aria-pressed` buttons.
- Copy update's text changes to "Copied". Add `aria-live="polite"` on that label span.

RagPicker
- Keeps its radiogroup, single tab stop, arrow/Home/End and 28px targets.
- Quiet options are always in the tree. They come up to full opacity on focus-within, and are always visible on coarse pointers.
- The disabled (viewer) version is `role="img"` with the label, not a fake radiogroup.

DateCell
- The rest-state button is focusable and labelled "Start date: Aug 1, 2026. Edit".
- Enter or click opens the native input, which receives focus and calls showPicker where supported.
- Escape or blur returns focus to the rest button.

Other controls
- Close and × are icon-only buttons with aria-labels.
- The trend button's aria-label names the trend.
- The global `:focus-visible` 2px #e43d96 outline is untouched. `gap-3` between cards now leaves room for it, which `gap-px` did not.
- Focus-visible reveals are added wherever hover reveals (the Beyond "Edit the vision" hint).

Motion
- Only colour/shadow transitions, `.animate-fade` on the DetailShell, the Foreground card lift (with `motion-reduce:hover:translate-y-0`), the agenda arrow nudge, and the existing MeasureMosaic tile fade.
- No stagger and no pulse.
- The globals reduced-motion kill switch still applies.

Tap targets
- Tiny text buttons keep the `text-[10px]` / `text-[11px]` / `text-xs` classes, so the pointer:coarse ::after rule grows them.
- rounded-lg and rounded-full controls are sized explicitly (py-2, h-7, h-8).
- Inputs keep the 16px floor.

## Grafted from the other directions

- calm-ops: StatusWord, a visible RAG word next to every light, so status reads at TV distance (church-leader stealThis)
- calm-ops: a `quiet` prop on RagPicker, where unchosen options fade until row hover or focus and stay always visible on coarse pointers (engineer stealThis)
- calm-ops: a shared `Select` wrapper in ui.tsx with appearance-none and an icon chevron, so the OS chevron never shows (engineer stealThis)
- calm-ops: This Week on the runfree-navy dark card, with Copy update in the header row and full-width agenda rows whose arrow nudges on hover (product-designer stealThis)
- calm-ops: Trajectory placed at sm:col-start-2 sm:col-end-5 on the shared MetricRow grid, under the numbers it plots (product-designer and engineer stealThis; brand-forward's TrajectoryChart already does this)
- typeset: disabled RagPicker renders only the single lit tile, so viewers see no wall of hollow circles (product-designer and engineer stealThis)
- typeset: DateCell shows plain text at rest and opens the native date input only on click (product-designer stealThis)
- typeset: one small uppercase field/column voice, `Label`, defined once in ui.tsx (engineer stealThis)
- typeset: no strikethrough on done steps, and 'past due' as words after the date
- typeset restraint (product-designer why): the Foreground is the only tinted band ground (Mid-Ground reverts to white), no staggered animate-rise, and no RAG_RING pill doubled beside the tile
- church-leader: the NumberDisc turns amber when an initiative is stale, so it is visible across the room
- engineer fix: .animate-rise dropped from the cards, because its `both` fill mode pins transform and would cancel hover:-translate-y-0.5
- engineer fix: showPicker() is wrapped in try/optional-call, falling back to a focused native input on Safari below 16
- Rejected: calm-ops' xl sticky drawer. It breaks 'detail opens under the clicked band', and row-span-4 in auto rows would stretch the bands apart.

## Do not change

- src/lib/execution.ts in full: RAG_LABEL, RAG_DOT, RAG_RING and STALE_AFTER_DAYS, plus effectiveStatus, daysSinceUpdate, isStale, reviewDue, initiativePace, trendFor, measureProgress, effectiveCurrent, renewalCycle and nextRenewalStop, and every write function. tests/execution.test.ts imports reviewDue, initiativePace and trendFor.
- src/app/globals.css (the animate-rise/fade utilities, the pointer:coarse tap-target rule, the 16px input floor, the focus ring), tailwind.config.ts, and src/app/projects/[id]/page.tsx
- The meeting order: header → This Week → SetupStrip → Horizon Storyline board with the detail under its band → AddInitiative/finished → Measures Dashboard → Renewal Cycle → Framework
- The selection model (the Selection type, sameSelection, default-selecting the first live initiative), `#execution-detail` rendered inside HorizonBoard right after the selected band, and scrollIntoView firing only on user clicks (ExecutionPanel line 162)
- One DetailShell for all four bands, which owns the eyebrow and title. InitiativeDetail and BackgroundDetail never print the name.
- Board content: one Beyond, four Background objectives, one Mid-Ground goal, four Foreground slots. Both 4-grids pad to four. Far-to-near order, with the rail darkening toward the Foreground and 'You are here' on it. Will Mancini's horizon names come verbatim from HORIZON_DEFINITIONS, and the Mid-Ground definition is quoted verbatim.
- No percent-complete, completion bar or ratio on any initiative. MeasureMosaic's '% of the way' and the pace sentence stay the only percentages.
- No RagPicker on an initiative. Status changes only through a check-in.
- The three write gates (canEdit / canManageSteps / canLog) stay on exactly the controls they gate today, and viewers see no editor copy (keep every existing role-split string).
- Text dates: by_when and cost stay free-text Cells showing prettyDate at rest. Nothing that isn't yyyy-mm-dd is ever counted overdue.
- This Week: the four tiles, reasons merged per initiative, every line a button, the By initiative / By person toggle only when there is more than one owner, and the Copy update digest text byte-for-byte. No Send button.
- SetupStrip's four steps, done logic, per-step navigation, and hiding once complete
- Renewal Cycle generated from the earliest live start_date and never stored, next stop only by default, twelve stops with year breaks when unfolded, and the editor-only no-anchor prompt
- Measures Dashboard: church-written headers, the Prior yr. / Now / Goal (next yr.) columns, trend cycling, the light, Trajectory only when the numbers parse, strategy inputs folded away, and one shared column definition (3 columns on phone, 5 from sm)
- MeasureMosaic's TILE_COLOURS palette, lighting rule and captions; the Execute icon and VisionFrameMark; the recoloured navy vision template plates; the God Dreams Framework/Books card destination
- ui.tsx stays the single home of shared primitives, with no second traffic light anywhere. RagPicker keeps its 28px target, one tab stop and arrow keys.
- The panel loads its own data on open (getExecutionData). hasExecution only controls tab visibility, and editors always see the tab.

## Verification

All commands run from /Users/Revive_Worship/Desktop/ChatGPT:Claude Data/runfree-client-portal. Per CLAUDE.md, never use `npm run` here; call the binaries directly.

1. Types and build:
   - `./node_modules/.bin/tsc --noEmit` must pass with zero errors after each ordered step.
   - `./node_modules/.bin/next build` must succeed at the end.
   - Also watch for Tailwind class typos: grep the diff for `aria-pressed:` and `first:top` style variants that don't apply.

2. Helper tests: `./node_modules/.bin/tsx --env-file=.env.local tests/execution.test.ts` must be all green and unchanged. lib/execution.ts is not in the diff; confirm with `git diff --stat`.

3. Gate audit, before screenshots:
   - Diff StepRow, CheckIn, UpdateHistory, MetricRow, BeyondText and SetupStrip line by line against HEAD.
   - Every control must read the same flag (canEdit / canManageSteps / canLog) it read before.
   - Grep for any new editor-facing string rendered without a gate.

4. Captures: with the dev server on 3001, against the seeded church with four initiatives in different states (the same project behind /tmp/runfree-panel-shot), run:
   `./node_modules/.bin/tsx --env-file=.env.local scripts/panel-shot.ts <project-id> execution admin 1440 12000 expand`
   `… execution viewer 1440 12000 expand`
   `… execution viewer 390 20000 expand`
   `… execution admin 390 20000 expand`
   plus the admin-coach variant, to match execution-1440-admin-coach.png.
   Height must exceed the panel, or you only capture the top third. Compare side by side with the four existing PNGs.

5. What to look for at 1440, admin:
   - This Week is runfree-navy (clearly distinct from the navyDeep sidebar), with a gradient top bar, a big count, and Agenda plus the toggle on one row.
   - The rail reads as one continuous far→near ramp.
   - The sunset line sits under Beyond.
   - Foreground cards sit on #E4E9F8 with shadow-md, and 'Review due' and '44d left' fit on ONE line (the old three-line wrap is gone).
   - '27d since check-in' does not break mid-word.
   - The stale card shows an amber disc.
   - The selected card has a magenta ring and a caret pointing into the detail, and there are no 1px gradient stripes.
   - The detail has one fewer nesting level: a meta strip instead of the fields card, a flat plan list, and a check-ins card list.
   - There are no browser mm/dd/yyyy date inputs at rest.
   - There is no OS select chevron.
   - Step RagPickers are quiet until hovered.
   - Trajectory marks sit under Prior / Now / Goal.
   - Renewal renders as a timeline with the magenta next node.
   - Only one tinted band ground.
   - No element uses gray-300 text apart from the '—' placeholder.

6. What to look for at 1440, viewer:
   - Every RagPicker is a single tile.
   - No 'Edit the vision', 'Choose two templates', '+ Add…', Rename, 'Write objective', add-measure rows or New-header form.
   - The Beyond aside is omitted when empty.
   - DateCells are plain text.

7. What to look for at 390, both roles:
   - `document.documentElement.scrollWidth === 390` (check with the mobile-audit script or preview devtools).
   - Rails are horizontal strips with 'You are here' on the right.
   - Cards stack in one column.
   - StepRow is a stacked card with one meta line.
   - Scoreboard is 2×2.
   - The Measures 3-column grid has captions and a full-width chart.
   - Copy update is full width.
   - Stat labels don't collide with the day bar.
   - Total capture height is noticeably below 17,434px; report the number.

8. Interaction checks in the preview browser:
   - Click each band: the detail opens under it and scrolls into view. Close works.
   - Hover a Foreground card: it lifts. Confirm there is no animate-rise class on any board card.
   - Keyboard-tab to a step RagPicker: the hidden options appear, and arrows move the choice.
   - DateCell: Enter opens the input, Escape returns focus, and a changed date saves.
   - Copy update: the clipboard text is byte-identical to a capture taken on HEAD. Diff the two strings.
   - 'Show N finished': a finished initiative is reachable and opens.
   - Renewal toggle: unfolds to twelve stops with Year chips, then folds back.
   - With prefers-reduced-motion emulated: no lift and no fade.

9. Safari/iOS: open the Next review DateCell on iOS Safari (or a Safari below 16 if available). The native input focuses and the date is editable without showPicker.

10. Show Andrew the 1440 admin and 390 viewer captures before merging, and call out the two judgement calls: the tile-shaped lights, and removing the strikethrough.

## Effort

L. One PR touching 10 files, with no schema, data, lib, copy or gate changes. About 55% of the work is class-string changes, 30% is structural re-markup (BANDS shape and rail, the card Grid, InitiativeBox, DetailShell, the InitiativeDetail meta strip / StepRow / plan flattening, the This Week header row, the CategoryGroup merge, the Renewal timeline) and 15% is new code: the ui.tsx primitives (Icon, StatusMark, StatusWord, NumberDisc, SubHeading, Label, Select, PINK_BUTTON, STATUS_TEXT), the RagPicker quiet and disabled states, the DateCell rest/edit swap, and TrajectoryChart. Budget 2.5–3 focused days, including the gate audit and the 1440/390 × viewer/admin capture sweep. StepRow and DateCell carry the most regression risk.
