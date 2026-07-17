import { architecturePanel } from './architecture.js';
// Every builder that turns data into HTML. Pure: data in, string out — no DOM, no fetch, no state,
// which is the whole reason it's its own module (main.ts used to render + poll as an import side
// effect, making these untestable).
import {
  BIO,
  BIO_CODA,
  CONTACTS,
  type Contact,
  ENTRIES,
  EXPERIENCE,
  type Entry,
  type Experience,
  type Group,
  type Link,
  NAME,
  type Project,
  TITLE,
  isGroup,
} from './data.js';
import { DIAGRAMS } from './diagrams.js';
import { DOC_ICON, ICONS, STAR_ICON, TAG_ICONS } from './icons.js';
import { esc, fmtDate, slug, tab } from './util.js';

/** A pill: a mark and a word. tagChip and featuredChip emitted this same markup independently. */
const chip = (cls: string, icon: string, label: string): string =>
  `<span class="tag ${cls}">${icon}<span>${esc(label)}</span></span>`;

/** Contact chip: the icon plus the value itself (the handle/address), not a category name. */
export function contactChip(c: Contact): string {
  // The icon name doubles as the colour class (.cx.github, .cx.resume, …).
  return `<a class="cx ${esc(c.icon)}" href="${esc(c.url)}" title="${esc(c.title)}" aria-label="${esc(c.title)}"${tab(c.external)}>
    <span class="cx-ico">${ICONS[c.icon]}</span><span class="cx-val">${esc(c.value)}</span>
  </a>`;
}

/** Status badge — how finished a project is (work-in-progress, archived). */
export function tagChip(p: Project): string {
  return p.tag ? chip(p.tag.icon, TAG_ICONS[p.tag.icon], p.tag.label) : '';
}

/** "Featured" badge for the list rows, marking the entries that also lead the banner above — so a
    reader scanning only the list can still tell which ones I'd point at first. */
export function featuredChip(e: Entry): string {
  return e.featured ? chip('featured', STAR_ICON, 'Featured') : '';
}

/** A drawn schematic in a card's media slot — the same markup wherever a diagram fills one, so a
    featured card and a group card can't drift on how a diagram is framed. */
const diagramMedia = (name: NonNullable<Project['diagram']>): string =>
  `<div class="media diagram ${esc(name)}">${DIAGRAMS[name]}</div>`;

/** The artwork that fills a featured card's empty space — image(s), or a drawn schematic. */
export function media(p: Project): string {
  if (p.images) {
    // Two stacked images in one frame each: the question png is contained so it stays readable, the
    // garden gif is cover-cropped as artwork (CSS: .media.stack img:first-child / :last-child).
    return `<div class="media stack">
      ${p.images.map((src) => `<img src="${esc(src)}" alt="" loading="lazy">`).join('')}
    </div>`;
  }
  if (p.image) return `<div class="media"><img src="${esc(p.image)}" alt="" loading="lazy"></div>`;
  if (p.diagram) return diagramMedia(p.diagram);
  return '';
}

/** Live/offline pill (dot + "live") for projects with a liveliness probe; starts as "checking". */
export function liveBadge(p: Project): string {
  if (!p.live) return '';
  return `<span class="live checking" data-live="${slug(p.name)}"><span class="dot"></span><span class="lt">checking…</span></span>`;
}

/**
 * The version the component is actually running, for the projects that ARE deployed components.
 *
 * Rendered `hidden` and empty: versions.ts fills it from /api/versions on load. A component that
 * does not answer therefore shows nothing at all, rather than an empty pill or the word "unknown" —
 * the badge appears only when there is something true to put in it.
 */
export function versionBadge(p: Project): string {
  if (!p.component) return '';
  return `<span class="ver" data-ver="${esc(p.component)}" title="Version of the running image" hidden></span>`;
}

/**
 * The status badges of an entry, as one right-aligned group. Every badge answers the same kind of
 * question — live, finished, featured — so they belong in one corner; they used to be scattered
 * across three places. `featured` is only meaningful in the list (the banner IS the featured set),
 * so the banner cards pass it over.
 */
function badges(...chips: string[]): string {
  const shown = chips.filter(Boolean);
  return shown.length ? `<span class="badges">${shown.join('')}</span>` : '';
}

/** Render a link as a button. `data-resolve-*` marks the ones whose href is fixed up at runtime. */
export function btn(l: Link, cls = 'btn'): string {
  const resolveAttr = l.resolve
    ? ` data-resolve="${esc(l.resolve.from)}" data-slug="${esc(l.resolve.slug)}"`
    : '';
  return `<a class="${cls} ${l.primary ? 'primary' : 'ghost'}" href="${esc(l.href)}"${tab(l.external)}${resolveAttr}>${esc(l.label)}</a>`;
}

/** Featured card for a single project. The `kubectl get pods` table needs full width to avoid
    wrapping, so a card carrying it gets the same width as a group card. */
/** A companion repo credited inside a featured card — the thing that builds/deploys the card's
 *  project. The block is one link to its repo; `has-companion` tells the stylesheet to squeeze the
 *  diagram beneath it so both fit. */
export function featCompanion(c: NonNullable<Project['companion']>): string {
  return `<a class="feat-companion" href="${esc(c.href)}" target="_blank" rel="noopener noreferrer">
    <span class="fc-label">Built &amp; shipped by</span>
    <span class="fc-name">${esc(c.name)}</span>
    <span class="fc-blurb">${esc(c.blurb)}</span>
  </a>`;
}

export function featCard(p: Project): string {
  // `data-component` lets the stylesheet give one card its own accent — the quiz is themed gold this
  // way — without a bespoke class per project. Absent for entries that are not deployed components.
  const componentAttr = p.component ? ` data-component="${esc(p.component)}"` : '';
  const cls = ['feat', 'lux', p.diagram === 'k8s' ? 'wide' : '', p.companion ? 'has-companion' : '']
    .filter(Boolean)
    .join(' ');
  return `<article class="${cls}"${componentAttr}>
    <div class="feat-top">
      <h3>${esc(p.name)}</h3>
      ${badges(tagChip(p), liveBadge(p), versionBadge(p))}
    </div>
    <div class="tech">${esc(p.tech)}</div>
    <p class="feat-blurb">${esc(p.blurb)}</p>
    ${p.companion ? featCompanion(p.companion) : ''}
    ${media(p)}
    ${p.links.length ? `<div class="feat-actions">${p.links.map((l) => btn(l)).join('')}</div>` : ''}
  </article>`;
}

/** The member sub-panels of a group. The banner card and the list row draw these identically, differing
    only in link style (button vs chip), so the panel is defined once rather than copied into both. */
export function memberPanels(members: Project[], linkCls: string): string {
  return members
    .map(
      (m) => `<div class="member">
        <div class="member-head">
          <span class="member-name">${esc(m.name)}</span>
          <span class="tech-inline">${esc(m.tech)}</span>
          ${badges(liveBadge(m), versionBadge(m))}
        </div>
        <p class="member-blurb">${esc(m.blurb)}</p>
        <div class="member-actions">${m.links.map((l) => btn(l, linkCls)).join('')}</div>
      </div>`,
    )
    .join('');
}

/** The head and body of a group — name, repo count, blurb, members. The banner card and the list row
    wrap this differently but say the same thing inside; defined once, same reason as memberPanels(). */
function groupBody(g: Group, linkCls: string, extra: string): string {
  return `<div class="proj-head">
      <span class="proj-name">${esc(g.name)}</span>
      <span class="grouped">${g.members.length} repos</span>
      ${badges(extra)}
    </div>
    <p class="proj-blurb">${esc(g.blurb)}</p>
    <div class="members">${memberPanels(g.members, linkCls)}</div>`;
}

/** A "you are here" map-pin marker, drawn to fill the spare vertical space of the card that IS this
    site — a pin over a pulsing ground ring. The pin is decorative (aria-hidden); the label carries
    the meaning for a screen reader. margin-top:auto in CSS floats it into whatever room is left. */
export function hereMarker(): string {
  return `<div class="here">
    <span class="here-pin">
      <span class="here-ping" aria-hidden="true"></span>
      <svg class="here-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5z"/></svg>
    </span>
    <span class="here-label">You are here</span>
  </div>`;
}

/** A group card's artwork: its wordmark if it has one, else a drawn schematic, else nothing. The same
    "pick one" shape as media() above, as guard clauses rather than a nested ternary. */
function groupMedia(g: Group): string {
  if (g.logo) {
    return `<div class="media logo"><img src="${esc(g.logo)}" alt="${esc(g.name)}" loading="lazy"></div>`;
  }
  if (g.diagram) return diagramMedia(g.diagram);
  return '';
}

/** Featured card for a group: one card, one shared blurb, then each member as a sub-panel —
    so a reader sees at a glance that the members are parts of a single project. */
export function featGroupCard(g: Group): string {
  const members = memberPanels(g.members, 'btn sm');
  // The wordmark is flavour, not a headline — it sits under the description rather than above it,
  // so the blurb still leads and the mark reads as a mark.
  return `<article class="feat wide lux${g.hereMarker ? ' has-here' : ''}">
    <div class="feat-top">
      <h3>${esc(g.name)}</h3>
      <span class="grouped">${g.members.length} repos</span>
    </div>
    <p class="feat-blurb">${esc(g.blurb)}</p>
    ${groupMedia(g)}
    ${g.hereMarker ? hereMarker() : ''}
    <div class="members">${members}</div>
  </article>`;
}

/** One row in the detailed all-projects list. */
export function projRow(p: Project): string {
  return `<li class="lux">
    <time>${esc(fmtDate(p.date))}</time>
    <div class="proj-body">
      <div class="proj-head">
        <span class="proj-name">${esc(p.name)}</span>
        <span class="tech-inline">${esc(p.tech)}</span>
        ${badges(featuredChip(p), tagChip(p), liveBadge(p), versionBadge(p))}
      </div>
      <p class="proj-blurb">${esc(p.blurb)}</p>
      <div class="proj-links">${p.links.map((l) => btn(l, 'chip')).join('')}</div>
    </div>
  </li>`;
}

/** A group occupies a single row, with its members nested inside it. */
export function groupRow(g: Group): string {
  return `<li class="lux group-row">
    <time>${esc(fmtDate(g.date))}</time>
    <div class="proj-body">
      ${groupBody(g, 'chip', featuredChip(g))}
    </div>
  </li>`;
}

export function expCard(e: Experience): string {
  // Raised, filled bubbles rather than underlined text: these are shipped IBM products a reader can go
  // read about — the strongest evidence on the card, so they shouldn't look like a footnote.
  const links = e.links
    .map(
      (l) => `<a class="exp-fab" href="${esc(l.url)}"${tab(true)}>
        <span class="fab-ico">${DOC_ICON}</span><span>${esc(l.label)}</span><span class="fab-out">↗</span>
      </a>`,
    )
    .join('');
  return `<article class="exp">
    <div class="exp-head">
      <span class="exp-role">${esc(e.role)}</span>
      <span class="exp-org">${esc(e.org)}</span>
      <time class="exp-dates">${esc(e.dates)}</time>
    </div>
    <p class="exp-blurb">${esc(e.blurb)}</p>
    <div class="exp-links">${links}</div>
  </article>`;
}

/**
 * The whole page, as a string. Pure — the caller puts it in the document. It no longer takes a
 * version: the footer tag is now a `[data-ver]` slot filled from /api/versions like every other badge,
 * and it shows the PLATFORM version, not this app's — a tag on the whole site should say what the
 * whole site is, and the per-project badges already say what each part is.
 */
export function pageHtml(): string {
  return `
    <!-- Landscape on a phone. Every picture here is drawn tall and narrow (the transit maps are 366×~700,
         the masthead diagram wider); turned sideways a phone has ~390px of HEIGHT, which none survives.
         Gated on max-height, not orientation: 'orientation: landscape' is true of every desktop monitor,
         and width would catch a tablet held upright. Height is what's actually short. -->
    <div class="rotate-me">
      <div class="rotate-card">
        <svg viewBox="0 0 24 24" aria-hidden="true" class="rotate-i"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10 19.5h4"/></svg>
        <p class="rotate-t">Please rotate your phone</p>
        <p class="rotate-m">This page is drawn tall — the diagrams need the height.</p>
      </div>
    </div>
    <div class="wrap">
      <header class="masthead">
        <h1>${esc(NAME)}</h1>
        <div class="mast-title">${esc(TITLE)}</div>
        <p class="mast-bio">${esc(BIO)}</p>
        <p class="mast-bio coda">${esc(BIO_CODA)}</p>
        <nav class="contact">${CONTACTS.map(contactChip).join('')}</nav>

        <!-- The diagram lives INSIDE the banner, which grows to fit it. The bio's closing claim
             ("everything below is built, hosted, and running right here") needs its evidence in the
             same frame, not a dialog floating over the page. -->
        ${architecturePanel()}

        <!-- An embedded pull-down bar, not a floating button: it spans the banner flush inside its
             lower edge, reading as the banner's own handle rather than a FAB stuck on top. The wide
             chevron is the affordance. -->
        <button class="arch-pull" data-act="architecture" type="button"
                aria-expanded="false" aria-controls="arch-panel">
          <span class="arch-pull-t">Show me the platform architecture</span>
          <svg class="arch-pull-c" viewBox="0 0 64 12" aria-hidden="true" focusable="false">
            <path d="M2 2 L32 10 L62 2" fill="none" stroke="currentColor"
                  stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </header>

      <section class="feat-section">
        <div class="lab">Featured</div>
        <div class="feat-banner">
          ${ENTRIES.filter((e) => e.featured)
            .map((e) => (isGroup(e) ? featGroupCard(e) : featCard(e)))
            .join('')}
        </div>
      </section>

      <section>
        <div class="lab exp-lab">Professional experience</div>
        <div class="exp-list">${EXPERIENCE.map(expCard).join('')}</div>
      </section>

      <section>
        <div class="lab proj-lab">All projects</div>
        <ol class="projects">
          ${ENTRIES.map((e) => (isGroup(e) ? groupRow(e) : projRow(e))).join('')}
        </ol>
      </section>

    </div>
    <div class="vertag" data-ver="platform" title="Platform version — the orchestration that runs this site">…</div>`;
}
