import './styles.css';
import { NAME, TITLE, BIO, LINKS, PROJECTS, type Project } from './data.js';

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  const mon = MONTHS[Number(m) - 1] || '';
  return day ? `${mon} ${Number(day)}, ${y}` : `${mon} ${y}`;
}

/** Featured card for a pinned project — with a prominent "Launch" button to its live front-end. */
function featCard(p: Project): string {
  return `<article class="feat">
    <div class="feat-top">
      <h3>${esc(p.name)}</h3>
      <span class="tech">${esc(p.tech)}</span>
    </div>
    <p class="feat-blurb">${esc(p.blurb)}</p>
    <div class="feat-actions">
      ${p.frontend ? `<a class="btn primary" href="${esc(p.frontend)}">Launch →</a>` : ''}
      <a class="btn ghost" href="${esc(p.repo)}" target="_blank" rel="noopener">Repository</a>
    </div>
  </article>`;
}

/** One line in the quick bulleted index. */
function bullet(p: Project): string {
  const live = p.frontend ? ` · <a href="${esc(p.frontend)}">live</a>` : '';
  return `<li><a href="${esc(p.repo)}" target="_blank" rel="noopener">${esc(p.name)}</a><span class="tech-inline">${esc(p.tech)}</span>${live}</li>`;
}

/** One row in the dated (last-commit) list. */
function datedRow(p: Project): string {
  return `<li>
    <time>${esc(fmtDate(p.date))}</time>
    <div class="dated-body">
      <div class="dated-head">
        <a class="dated-name" href="${esc(p.repo)}" target="_blank" rel="noopener">${esc(p.name)}</a>
        ${p.frontend ? `<a class="chip" href="${esc(p.frontend)}">Open front-end →</a>` : ''}
      </div>
      <p class="dated-blurb">${esc(p.blurb)}</p>
    </div>
  </li>`;
}

function render(): void {
  const pinned = PROJECTS.filter((p) => p.pinned);
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
        </nav>
      </header>

      ${
        pinned.length
          ? `<section>
              <div class="lab">Featured</div>
              <div class="feat-grid">${pinned.map(featCard).join('')}</div>
            </section>`
          : ''
      }

      <section>
        <div class="lab">All projects</div>
        <ul class="bullets">${PROJECTS.map(bullet).join('')}</ul>
      </section>

      <section>
        <div class="lab">By last commit</div>
        <ol class="dated">${PROJECTS.map(datedRow).join('')}</ol>
      </section>

      <footer class="foot">
        Built with Vanilla TypeScript + Vite · served behind an nginx reverse proxy.
      </footer>
    </div>`;
}

render();
