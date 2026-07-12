import './styles.css';
import { NAME, TITLE, BIO, LINKS, PROJECTS, EXPERIENCE, type Project } from './data.js';

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  const mon = MONTHS[Number(m) - 1] || '';
  return day ? `${mon} ${Number(day)}, ${y}` : `${mon} ${y}`;
}

/** Live/offline pill (red dot + "live") for projects with a liveliness probe; starts as "checking". */
function liveBadge(p: Project): string {
  if (!p.live) return '';
  return `<span class="live checking" data-live="${slug(p.name)}"><span class="dot"></span><span class="lt">checking…</span></span>`;
}

/** Featured card for the horizontal banner. */
function featCard(p: Project): string {
  return `<article class="feat lux">
    <div class="feat-top">
      <h3>${esc(p.name)}</h3>
      ${liveBadge(p)}
    </div>
    <div class="tech">${esc(p.tech)}</div>
    <p class="feat-blurb">${esc(p.blurb)}</p>
    <div class="feat-actions">
      ${p.frontend ? `<a class="btn primary" href="${esc(p.frontend)}">Launch →</a>` : ''}
      <a class="btn ghost" href="${esc(p.repo)}" target="_blank" rel="noopener">Repository</a>
    </div>
  </article>`;
}

/** One row in the detailed all-projects list (dates + descriptions). */
function projRow(p: Project): string {
  return `<li class="lux">
    <time>${esc(fmtDate(p.date))}</time>
    <div class="proj-body">
      <div class="proj-head">
        <a class="proj-name" href="${esc(p.repo)}" target="_blank" rel="noopener">${esc(p.name)}</a>
        <span class="tech-inline">${esc(p.tech)}</span>
        ${liveBadge(p)}
        ${p.frontend ? `<a class="chip" href="${esc(p.frontend)}">Open front-end →</a>` : ''}
      </div>
      <p class="proj-blurb">${esc(p.blurb)}</p>
    </div>
  </li>`;
}

function expCard(e: (typeof EXPERIENCE)[number]): string {
  const links = e.links
    .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`)
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

function render(): void {
  const featured = PROJECTS.filter((p) => p.featured);
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="wrap">
      <header class="masthead">
        <h1>${esc(NAME)}</h1>
        <div class="mast-title">${esc(TITLE)}</div>
        <p class="mast-bio">${esc(BIO)}</p>
        <nav class="contact">
          <a href="${esc(LINKS.github)}" target="_blank" rel="noopener">GitHub</a>
          <a href="${esc(LINKS.email)}">Email</a>
          <a href="${esc(LINKS.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>
          <a href="${esc(LINKS.resume)}" target="_blank" rel="noopener">Résumé</a>
        </nav>
      </header>

      <section>
        <div class="lab">Featured</div>
        <div class="feat-banner">${featured.map(featCard).join('')}</div>
      </section>

      <section>
        <div class="lab">Professional experience</div>
        <div class="exp-list">${EXPERIENCE.map(expCard).join('')}</div>
      </section>

      <section>
        <div class="lab">All projects</div>
        <ol class="projects">${PROJECTS.map(projRow).join('')}</ol>
      </section>

      <footer class="foot">
        Built with Vanilla TypeScript + Vite · served behind an nginx reverse proxy.
      </footer>
    </div>`;
}

/** Probe one project's liveliness through the reverse proxy. */
async function probe(p: Project): Promise<boolean> {
  if (!p.live) return false;
  try {
    const r = await fetch(p.live.url, { cache: 'no-store' });
    if (!r.ok) return false;
    if (p.live.type === 'vmcp') {
      const servers = (await r.json()) as { slug: string; enabled: boolean }[];
      return Array.isArray(servers) && servers.some((s) => s.slug === p.live!.slug && s.enabled);
    }
    return true;
  } catch {
    return false;
  }
}

/** Poll every project with a probe and paint its indicator(s). Both the featured card and the list
    row share the same data-live id, so one update covers both. */
async function refreshLiveness(): Promise<void> {
  await Promise.all(
    PROJECTS.filter((p) => p.live).map(async (p) => {
      const up = await probe(p);
      document.querySelectorAll<HTMLElement>(`.live[data-live="${slug(p.name)}"]`).forEach((el) => {
        el.classList.remove('checking');
        el.classList.toggle('up', up);
        el.classList.toggle('down', !up);
        const lt = el.querySelector('.lt');
        if (lt) lt.textContent = up ? 'live' : 'offline';
      });
    }),
  );
}

render();
refreshLiveness();
setInterval(refreshLiveness, 60_000); // poll liveliness every minute
