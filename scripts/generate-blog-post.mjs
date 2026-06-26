#!/usr/bin/env node
// Drafts one weekly blog post by calling the DeepSeek API, writes it as a
// draft:true markdown file, and rotates the topic queue. Never publishes on
// its own — generate-blog.yml opens a PR for human review.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOPICS_PATH = path.join(__dirname, 'topics.json');
const BLOG_DIR = path.join(__dirname, '..', 'src', 'content', 'blog');
const DRY_RUN = process.argv.includes('--dry-run');

const SYSTEM_PROMPT = `You are ghostwriting a technical blog post for Fan Zhang, an algorithm engineer who builds computer vision and AI agents for surgical robotics at Weijing Medical Surgical Robotics Research Institute. His background: pharmacy (B.S.) -> bioinformatics/clinical pharmacy (M.S., Peking University, GWAS and pharmacogenomics) -> surgical computer vision and edge AI deployment (YOLO-based bleeding/smoke/instrument detection, NVIDIA IGX/AGX + Holoscan + TensorRT, RAG-based surgical agent "Surg-Agent").

Voice: precise, skeptical of clean-looking results, grounded in concrete engineering detail (model names, hardware, failure modes) rather than generic AI-blog filler. No hype, no "in today's fast-paced world" framing, no invented benchmark numbers or invented citations. It is fine to say "I haven't tried X yet" or to pose an open question.

Respond ONLY with a JSON object with this exact shape:
{
  "title": "string, specific, under 70 chars",
  "description": "string, one sentence, under 160 chars",
  "tags": ["2 to 4 short lowercase tags"],
  "body": "string, markdown body, 400-700 words, no leading h1 (title is rendered separately)"
}`;

function loadTopics() {
  return JSON.parse(readFileSync(TOPICS_PATH, 'utf-8'));
}

function saveTopics(data) {
  writeFileSync(TOPICS_PATH, JSON.stringify(data, null, 2) + '\n');
}

function pickNextTopic(data) {
  const remaining = data.queue.filter((t) => !data.used.includes(t));
  if (remaining.length > 0) return remaining[0];
  // exhausted the queue — cycle back to the start
  data.used = [];
  return data.queue[0];
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

async function callDeepSeek(topic) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not set');

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      response_format: { type: 'json_object' },
      temperature: 0.6,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Write the post for this topic: ${topic}` },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`DeepSeek API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

async function main() {
  const topics = loadTopics();
  const topic = pickNextTopic(topics);
  console.log(`Topic: ${topic}`);

  if (DRY_RUN) {
    console.log('--dry-run: skipping API call. System prompt and topic above are what would be sent.');
    return;
  }

  const post = await callDeepSeek(topic);
  const slug = slugify(post.title);
  const date = new Date().toISOString().slice(0, 10);

  const frontmatter = [
    '---',
    `title: "${post.title.replace(/"/g, '\\"')}"`,
    `description: "${post.description.replace(/"/g, '\\"')}"`,
    `date: ${date}`,
    `tags: [${post.tags.map((t) => `"${t}"`).join(', ')}]`,
    'draft: true',
    '---',
    '',
    post.body,
    '',
  ].join('\n');

  if (!existsSync(BLOG_DIR)) throw new Error(`Blog content dir not found: ${BLOG_DIR}`);
  const outPath = path.join(BLOG_DIR, `${slug}.md`);
  writeFileSync(outPath, frontmatter);
  console.log(`Wrote ${outPath}`);

  topics.used.push(topic);
  saveTopics(topics);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
