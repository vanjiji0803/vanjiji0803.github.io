# Fan Zhang — Personal Site

Astro-based personal site: resume, AI/Projects showcase, and a blog partially
drafted by an automated agent workflow.

## Structure

```
src/
  layouts/BaseLayout.astro    shared head, nav, theme toggle, footer
  components/                 Hero, About, Timeline, Research, ProjectsLab,
                               SkillsGrid, Contact, BlogCard
  content/blog/*.md           blog posts (frontmatter: title, description, date, tags, draft)
  content.config.ts           blog collection schema
  pages/
    index.astro                resume page
    blog/index.astro            blog list (drafts hidden in production)
    blog/[slug].astro           blog post template
  styles/global.css           all styles, CSS vars in :root
scripts/
  generate-blog-post.mjs      called by the weekly Action — drafts one post via DeepSeek
  topics.json                 rotating topic queue
.github/workflows/
  deploy.yml                  build + deploy to GitHub Pages on push to main
  generate-blog.yml           weekly cron, opens a PR with a new draft post
```

## Local development

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # production build to dist/
```

## Before you publish

1. Add your CV as `public/assets/Fan_Zhang_CV.pdf` (the Download CV button links to it).
2. In the GitHub repo settings → Pages, set Source to **GitHub Actions** (one-time).
3. Add a repo secret `DEEPSEEK_API_KEY` (Settings → Secrets and variables → Actions) before relying on the scheduled blog draft workflow — without it, `generate-blog.yml` will run but fail at the API call step.

## How the blog automation works

Every Monday, `generate-blog.yml` runs `scripts/generate-blog-post.mjs`, which:
1. Picks the next unused topic from `scripts/topics.json` (cycles once exhausted).
2. Calls the DeepSeek API with a system prompt fixing voice/background, asking for a grounded, specific technical post — not generic AI-blog filler.
3. Writes `src/content/blog/<slug>.md` with `draft: true` and opens a PR.

Draft posts never appear on the live site (`blog/index.astro` and `blog/[slug].astro` filter out `draft: true` in production builds). Review the PR, edit as needed, flip `draft: false`, and merge — `deploy.yml` rebuilds and publishes on merge to `main`.

Test the generator locally without spending API credits:

```sh
node scripts/generate-blog-post.mjs --dry-run
```

## Publishing on GitHub Pages

```sh
git init
git add .
git commit -m "initial site"
git branch -M main
git remote add origin https://github.com/vanjiji0803/vanjiji0803.github.io.git
git push -u origin main
```

Site will be live at `https://vanjiji0803.github.io` once the `deploy.yml` workflow run completes (check the Actions tab).
