# project-platform

The personal platform, as a monorepo. Two subprojects, one design language, one identity.

| Subproject | What it is |
| --- | --- |
| **[portfolio-home](portfolio-home/)** | The home page at `andres.project-platform.me`, and the source of truth for `@platform/ui` — the shared design tokens and server middleware every front end here builds from. |
| **[platform-auth](platform-auth/)** | The identity service: a username, a memorable code, and a signed JWT. See its [DESIGN.md](platform-auth/DESIGN.md). |

They share a repository, not a build. Each has its own `package.json`, its own Dockerfile, and is
deployed as its own container by [platform-orchestration](https://github.com/AndresI19/platform-orchestration).
The monorepo exists because they are two halves of one platform that version together — the home page
renders identities the auth service issues — not because they compile as one unit.

`@platform/ui` lives under `portfolio-home/packages/platform-ui`. The quiz
([data-driven-quiz-server](https://github.com/AndresI19/data-driven-quiz-server)) consumes it by
vendoring this repo as a git submodule.
